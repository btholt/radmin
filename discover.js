const co = require('co')
const agent = require('superagent-promise')(require('superagent'), Promise)
const fs = require('fs')
const _ = require('lodash')
const { throttledGetUsersInfo, stillAdmin, reduceAdminStatus } = require('./scanner')
const configBuffer = fs.readFileSync('./config.json')
const config = JSON.parse(configBuffer)
const SUBREDDIT_URL = 'https://www.reddit.com/r/'
const TOPIC_URL = 'https://www.reddit.com/comments/'
const SUBREDDIT_URL_SUFFIX = '.json'
const { mongoUsername, mongoPassword, mongoHost, mongoPath, mongoAdminCollection } = config.private[process.env.NODE_ENV]
const maxConnections = config.maxConnections || 3
const { connect } = require('mongodb').MongoClient
const mongoUrl = `mongodb://${mongoUsername}:${mongoPassword}@${mongoHost}/${mongoPath}`

const requestSubreddit = (subreddit) => agent.get(`${SUBREDDIT_URL}${subreddit}${SUBREDDIT_URL_SUFFIX}`)
const requestTopic = (topic) => agent.get(`${TOPIC_URL}${topic}${SUBREDDIT_URL_SUFFIX}`)
const requestMods = (subreddit) => agent.get(`${SUBREDDIT_URL}${subreddit}${MOD_URL_SUFFIX}`)

const scanSubreddits = (subreddits, maxTopics, logger, replyCB, reactCB) => (
  co(function * () {
    const requestNextSubreddit = (index) => {
      if (subreddits[index]) {
        return scanSubreddit(subreddits[index], maxTopics, logger, replyCB, reactCB).then(requestNextSubreddit.bind(this, index+1))
      }
    }
    requestNextSubreddit(0)
  }).catch((err) => logger.error(err, replyCB))
)

const scanSubreddit = (subreddit, maxTopics, logger, replyCB, reactCB) => (
  co(function * () {
    reactCB()
    logger.info(`start subreddit scan of ${subreddit}`)
    const data = yield requestSubreddit(subreddit)
    const posts = _.get(data, 'body.data.children', [])
    const promises = []
    for(let i = 0; i < maxTopics && i < posts.length; i++) {
      logger.info(`start scan of topic ${posts[i].data.id}`)
      promises.push(_scanTopic(posts[i].data.id, logger, replyCB))
    }
    const topicAdmins = yield Promise.all(promises)
    const allAdmins = _.chain(topicAdmins)
      .flatten()
      .uniq()
      .map((admin) => admin.toLowerCase())
      .value()
    logger.info(`*overall*: ${allAdmins.join(', ')}`)
    updateDB(allAdmins, `/r/${subreddit}`, logger, replyCB, reactCB)
    return yield Promise.resolve(true)
  }).catch((err) => logger.error(err, replyCB))
)

const scanTopic = (topic, logger, replyCB, reactCB) => (
  co(function * () {
    logger.info(`start scan of topic ${topic}`)
    let admins = yield _scanTopic(topic, logger, replyCB)
    admins = admins.map((admin) => admin.toLowerCase())
    updateDB(admins, `topic ${topic}`, logger, replyCB, reactCB)
  })
)

const _scanTopic = (topic, logger, replyCB) => {
  return new Promise((resolve, reject) => {
    co(function * () {
      const data = yield requestTopic(topic)
      let admins = []
      const postAdminField = _.get(data, 'body.0.data.children.0.data.distinguished', null)
      if (postAdminField === 'admin') {
        const author = _.get(data, 'body.0.data.children.0.data.author', false)
        if (author) {
          admins.push(author)
        }
      }
      findAdmins(_.get(data, 'body.1.data.children', []), admins)
      admins = _.uniq(admins)
      logger.info(`*${topic}*: ${admins.join(', ')}`)
      resolve(admins)
    }).catch((err) => logger.error(err, replyCB))
  })
}

const findAdmins = (children, admins) => {
  for (let i = 0; i < children.length; i++) {
    const child = _.get(children, [i, 'data'])
    if (child.distinguished === 'admin') {
      admins.push(child.author)
    }
    const childChildren = _.get(child, 'replies.data.children', [])
    findAdmins(childChildren, admins)
  }
}

const updateDB = (foundAdmins, location, logger, replyCB, reactCB) => (
  co(function * () {
    logger.info('start update')
    const db = yield connect(mongoUrl)
    const collection = db.collection(mongoAdminCollection)
    const docs = yield collection.find({}).toArray()
    const [currentAdmins, exAdmins] = docs.reduce(reduceAdminStatus, [[],[]])
    const needsActionAdmins = foundAdmins.filter((current) => !currentAdmins.includes(current))
    logger.info(`*needs action*: ${needsActionAdmins.join(', ')}`)

    if (needsActionAdmins.length <= 0) {
      logger.info(`did not discover any new admins or exreddits in ${location}`)
      reactCB()
      return
    }

    const usersInfo = yield throttledGetUsersInfo(needsActionAdmins, maxConnections)
    const users = usersInfo
      .map(stillAdmin)
      .map((user, index) => {
        const obj = {}
        Object.assign(obj, { username: needsActionAdmins[index]}, user)
        return obj
      })
    const newsworthyAdmins = users.filter((current) => current.isAdmin || !exAdmins.includes(current.username))
    if (newsworthyAdmins.length > 0) {
      const [newAdmins, newExreddits] = newsworthyAdmins.reduce(reduceAdminStatus, [[], []])
      if (newAdmins.length > 0) {
        logger.result(`*new admins discovered in ${location}*: ${newAdmins.join(', ')}`, replyCB)
      }
      if (newExreddits.length > 0) {
        logger.result(`*new exreddits discovered in ${location}*: ${newExreddits.join(', ')}`, replyCB)
      }
      const result = yield collection.insertMany(newsworthyAdmins)
      logger.result(`wrote to ${mongoAdminCollection}`)
    } else {
      logger.info(`did not discover any new admins or exreddits in ${location}`)
      reactCB()
    }
  }).catch((err) => logger.error(err, replyCB))
)

module.exports = {
  scanSubreddit,
  scanSubreddits,
  scanTopic
}
