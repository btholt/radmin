const cheerio = require('cheerio')
const agent = require('superagent-promise')(require('superagent'), Promise)
const promisify = require('es6-promisify')
const co = require('co')
const _ = require('lodash')
const fs = require('fs')
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const DB_PATH = './data.json'
const PROFILE_URL_BASE = 'https://www.reddit.com/user/'
const ADMIN_SELECTOR = '.titlebox .admin'

const fetchUserPage = (user) => agent.get(`${PROFILE_URL_BASE}${user}`)
const stillAdmin = (data, index) => {
  const $ = cheerio.load(data.text)
  const isAdmin = $(ADMIN_SELECTOR).length > 0
  return { isAdmin }
}

const fullScan = (logger, replyCB) => (
  co(function * () {
    logger.info('start full scan', replyCB)
    const dbBuffer = yield readFile(DB_PATH)
    const db = JSON.parse(dbBuffer)
    const usersInfo = yield Promise.all(db.current.map((user) => fetchUserPage(user.username)))
    const users = usersInfo
      .map(stillAdmin)
      .map((user, index) => {
        const obj = {}
        Object.assign(obj, user, db.current[index])
        return obj
      })
    logger.result(JSON.stringify(users,null,0))
    const newlyRemoved = yield updateDBFullScan(users, db, logger, replyCB)
    return newlyRemoved
  }).catch((err) => logger.error(err))
)

const updateDBFullScan = (users, previous, logger, replyCB) => (
  co(function * () {
    logger.info('diffing fullScan with new finds')
    const notAdmins = users.filter((user) => !user.isAdmin)
    if (notAdmins.length > 0) {
      logger.write(`New exreddits found: ${JSON.stringify(notAdmins,null,0)}`, replyCB)
      const former = _.uniqBy(previous.former.concat(notAdmins), (user) => user.username)
        .map((user) => _.omit(user, ['isAdmin']))
      const current = users
        .filter((user) => user.isAdmin)
        .map((user) => _.omit(user, ['isAdmin']))
      yield writeFile(DB_PATH, JSON.stringify({current, former},null,4))
    }
    else {
      logger.info('No new exreddits found with fullScan', replyCB)
    }
    return notAdmins
  }).catch((err) => logger.error(err))
)

const scan = (username, logger, replyCB) => (
  co(function * () {
    logger.info(`start scan for ${username}`, replyCB)
    const userData = yield fetchUserPage(username)
    const user = Object.assign(stillAdmin(userData), {username})
    logger.result(JSON.stringify(user,null,0))
    const didChange = yield updateDBScan(user, logger, replyCB)
    return didChange
  }).catch((err) => logger.error(err))
)

const updateDBScan = (user, logger, replyCB) => (
  co(function * () {
    logger.info(`diffing scan with ${user.username}`)
    const result = {isNewAdmin: false, isNewExreddit: false}
    const dbBuffer = yield readFile(DB_PATH)
    const db = JSON.parse(dbBuffer)
    const wasAdmin = db.current.filter((admin) => admin.username === user.username).length > 0
    if (user.isAdmin) {
      if (wasAdmin) {
        logger.info(`${user.username} was already known to be an admin`, replyCB)
      }
      else {
        result.isNewAdmin = true
        logger.write(`${user.username} is a new admin`, replyCB)
        db.current.push(_.omit(user, ['isAdmin']))
        yield writeFile(DB_PATH, JSON.stringify(db,null,4))
      }
    }
    else {
      if (wasAdmin) {
        result.isNewExreddit = true
        logger.write(`${user.username} is a new exreddit`, replyCB)
        db.former.push(_.omit(user, ['isAdmin']))
        db.current = db.current.filter((admin) => admin.username !== user.username)
        yield writeFile(DB_PATH, JSON.stringify(db,null,4))
      }
      else {
        logger.info(`${user.username} was already known as not being an admin`, replyCB)
      }
    }
    return result
  }).catch((err) => logger.error(err))
)

module.exports = {
  fullScan,
  scan
}
