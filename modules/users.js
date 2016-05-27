// const agent = require('superagent-promise')(require('superagent'), Promise)
const promisify = require('es6-promisify')
const co = require('co')
const _ = require('lodash')
const fs = require('fs')
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const DB_PATH = './data.json'

const whoisFormat = (user, status) => `Name: ${user.name}
Role: ${user.role}
Slack: ${user.slack}
Verified If Previous Admin: ${user.verified}
Verification Reason: ${user.verifiedReason}
Admin Status: ${status}`

const whois = (username, logger, replyCB) => (
  co(function * () {
    logger.info(`reading whois of ${username}`, replyCB)
    const dbBuffer = yield readFile(DB_PATH)
    const db = JSON.parse(dbBuffer)
    const status = 'not found'
    const findUser = (needle) => needle.username.toLowerCase()=== username.toLowerCase()

    let user = _.find(db.current, findUser)
    if (user) {
      return logger.result(whoisFormat(user, 'Admin'), replyCB)
    }

    user = _.find(db.exreddit, findUser)
    if (user) {
      return logger.result(whoisFormat(user, 'Current Exreddit'), replyCB)
    }

    user = _.find(db.uninvited, findUser)
    if (user) {
      return logger.result(whoisFormat(user, 'Uninvited Exreddit'), replyCB)
    }

    logger.info(`I don't have any whois info for ${username}`, replyCB)
  }).catch((err) => logger.error(err))
)

module.exports = {
  whois
}
