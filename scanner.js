const cheerio = require('cheerio')
const agent = require('superagent-promise')(require('superagent'), Promise)
const co = require('co')
const _ = require('lodash')
const fs = require('fs')
const { connect } = require('mongodb').MongoClient
const PROFILE_URL_BASE = 'https://origin.reddit.com/user/'
const ADMIN_SELECTOR = '.titlebox .admin'
const configBuffer = fs.readFileSync('./config.json')
const config = JSON.parse(configBuffer)
const { mongoUsername, mongoPassword, mongoHost, mongoPath, mongoAdminCollection } = config.private[process.env.NODE_ENV]
const maxConnections = config.maxConnections || 3
const mongoUrl = `mongodb://${mongoUsername}:${mongoPassword}@${mongoHost}/${mongoPath}`

const fetchUserPage = (user) => agent.get(`${PROFILE_URL_BASE}${user}`).set('Accept-Encoding','gzip, deflate').end()
// const fetchUserPage = (user) => {
//   console.log('fetch', user)
//   return Promise.resolve(user)
// }
const stillAdmin = (data, index) => {
  const $ = cheerio.load(data.text)
  const isAdmin = $(ADMIN_SELECTOR).length > 0
  return { isAdmin }
}

const reduceAdminStatus = (acc, current) => {
  if (current.isAdmin) {
    acc[0].push(current.username)
  } else {
    acc[1].push(current.username)
  }
  return acc
}

const throttledGetUsersInfo = (usernames, maxRequests) => {
  return new Promise((resolve, reject) => {
    const gen = getUsersInfo(usernames)
    const users = []
    const requestNext = function (gen, users) {
      const result = gen.next()
      if (result.value) {
        users.push(result.value)
      }
      if (!result.done) {
        result.value.then(requestNext)
      } else {
        Promise.all(users).then(resolve)
      }
    }.bind(this, gen, users)
    for (let i = 0; i < maxRequests; i++) {
      requestNext()
    }
  })
}

const getUsersInfo = function * (usernames)  {
  for (let i = 0; i < usernames.length; i++) {
    const promise = fetchUserPage(usernames[i])
    yield promise
  }
}

const fullScan = (logger, replyCB) => (
  co(function * () {
    logger.info('start full scan', replyCB)
    const db = yield connect(mongoUrl)
    const collection = db.collection(mongoAdminCollection)
    const docs = yield collection.find({isAdmin: true}).toArray()
    const usernames = docs.map((user) => user.username)
    const usersInfo = yield throttledGetUsersInfo(usernames, maxConnections)
    // const usersInfo = yield Promise.all(docs.map((user) => fetchUserPage(user.username)))
    const users = usersInfo
      .map(stillAdmin)
      .map((user, index) => {
        const obj = {}
        Object.assign(obj, docs[index], user)
        return obj
      })
    logger.result(JSON.stringify(users,null,0))
    const newlyRemoved = yield updateDBFullScan(users, collection, logger, replyCB)
    return newlyRemoved
  }).catch((err) => logger.error(err), replyCB)
)

const updateDBFullScan = (users, collection, logger, replyCB) => (
  co(function * () {
    logger.info('diffing fullScan with new finds')
    const notAdmins = users.filter((user) => !user.isAdmin)
    console.log(notAdmins)
    if (notAdmins.length > 0) {
      const bulk = collection.initializeUnorderedBulkOp()
      const names = notAdmins.map((notAdmin) => notAdmin.username).join(', ')
      logger.write(`New exreddits found: ${names}`, replyCB)
      const update = notAdmins.forEach((notAdmin) => {
        bulk.find({username: notAdmin.username}).updateOne({$set: {isAdmin: false}})
      })
      const result = yield bulk.execute()
    }
    else {
      logger.info('No new exreddits found', replyCB)
    }
    return notAdmins
  }).catch((err) => logger.error(err, replyCB))
)

const scan = (username, logger, replyCB, reactCB) => (
  co(function * () {
    logger.info(`start scan for ${username}`)
    const [ userData, db ] = yield Promise.all([
      yield fetchUserPage(username),
      yield connect(mongoUrl)
    ])
    const collection = db.collection(mongoAdminCollection)
    const siteUser = stillAdmin(userData)

    const user = yield collection.findOne({username})
    let result

    if (user) {
      if (user.isAdmin && siteUser.isAdmin) {
        logger.info(`${username} was already known to be an admin`)
        reactCB(config.emoji.end)
      } else if (user.isAdmin && !siteUser.isAdmin) {
        logger.write(`${username} is a new exreddit`, replyCB)
        result = yield collection.updateOne({username}, {$set: {isAdmin: false}})
      } else if (!user.isAdmin && siteUser.isAdmin) {
        logger.write(`${username} was an exreddit and now is an admin? Traitor`, replyCB)
        result = yield collection.updateOne({username}, {$set: {isAdmin: true}})
      } else {
        logger.info(`${username} was already known to be an exreddit`)
        reactCB(config.emoji.end)
      }
    } else {
      if (siteUser.isAdmin) {
        logger.write(`${username} is a new admin`, replyCB)
        result = yield collection.insertOne({isAdmin: true, username})
      } else {
        logger.write(`${username} is not an admin`)
        reactCB(config.emoji.end)
      }
    }
    if (result && result.insertedCount <= 0 && result.modifiedCount <= 0) {
      logger.error(`${username} not written to the database!`, replyCB)
    }
  }).catch((err) => logger.error(err, replyCB))
)

const list = (logger, replyCB) => (
  co(function * () {
    logger.info('retrieving admins and exreddits from the database', replyCB)
    const db = yield connect(mongoUrl)
    const collection = db.collection(mongoAdminCollection)
    const docs = yield collection.find({}).toArray()
    const [admins, exreddits] = docs.reduce(reduceAdminStatus, [[], []])
    logger.result(`*admins:* ${admins.sort().join(', ')}`, replyCB)
    logger.result(`*exreddits:* ${exreddits.sort().join(', ')}`, replyCB)
  }).catch((err) => logger.error(err, replyCB))
)

module.exports = {
  fullScan,
  scan,
  list,
  throttledGetUsersInfo,
  stillAdmin,
  reduceAdminStatus
}
