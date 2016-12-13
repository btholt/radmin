const scanner = require('./scanner')
const discover = require('./discover')
const logger = require('./logger')
const Botkit = require('botkit')
const co = require('co')
const _ = require('lodash')
const fs = require('fs')
const configBuffer = fs.readFileSync('./config.json')
const config = JSON.parse(configBuffer)
const token = config.private[process.env.NODE_ENV].slackKey
const newUserRegex = () => /(?:reddit.com\/u(ser)?\/)([\w\d_-]{3,20})/ig
const newTopicRegex = () => /(?:reddit.com\/r\/[\w\d-_]+\/comments\/)([\w\d]+)/ig
const newSubredditRegex = () => /(?:reddit.com\/r\/)([\w\d-_]+\b)(?!\/[\w\d-_])/ig

if (!token) {
  logger.error('No Slack token')
  process.exit(1);
}

const controller = Botkit.slackbot({
  debug: false
})

const botAPI = controller.spawn({
  token,
  retry: 'Infinity'
}).startRTM((err) => {
  if (err) {
    logger.error('Slack Error', err)
    throw new Error(err)
  }
})

controller.hears(['fullScan'], ['direct_mention'], (bot, msg) => {
  const replyCB = bot.reply.bind(this, msg)
  if (config.superusers.indexOf(msg.user) < 0) {
    return logger.info("You don't have permission to do this. Sorry. This command hammers the reddit API.", replyCB)
  }
  scanner.fullScan(logger, bot.reply.bind(this, msg))
})

controller.hears([newUserRegex()], ['ambient'], (bot, msg) => {
  let execMatches
  const matcher = newUserRegex()
  let matches = []
  while ((execMatches = matcher.exec(msg.text)) !== null) {
    matches.push(execMatches[2])
  }
  matches = _.uniq(matches)
  const replyCB = bot.reply.bind(this, msg)
  matches.forEach((match) => scanner.scan(match.toLowerCase(), logger, bot.reply.bind(this, msg)))
})

controller.hears(['list'], ['direct_mention'], (bot, msg) => {
  const parts = msg.text.split(' ')
  if (parts[0] !== 'list') return

  scanner.list(logger, bot.reply.bind(this, msg))
})

controller.hears([newSubredditRegex()], ['ambient'], (bot, msg) => {
  let execMatches
  const matcher = newSubredditRegex()
  let matches = []
  while ((execMatches = matcher.exec(msg.text)) !== null) {
    matches.push(execMatches[1])
  }
  matches = _.uniq(matches).map((name) => name.toLowerCase())
  const replyCB = bot.reply.bind(this, msg)
  discover.scanSubreddits(matches, config.maxTopics, logger, bot.reply.bind(this, msg))
})

controller.hears([newTopicRegex()], ['ambient'], (bot, msg) => {
  let execMatches
  const matcher = newTopicRegex()
  let matches = []
  while ((execMatches = matcher.exec(msg.text)) !== null) {
    matches.push(execMatches[1])
  }
  matches = _.uniq(matches)
  matches.forEach((match) => discover.scanTopic(match, logger, bot.reply.bind(this, msg)))
})
