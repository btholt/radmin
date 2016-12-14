const chalk = require('chalk')
const resultColor = chalk.green
const errorColor = chalk.red
const infoColor = chalk.gray
const writeColor = chalk.yellow

module.exports = {
  result (msg, replyCB) {
    if (typeof replyCB === 'function') {
      this.say(msg, replyCB)
    }
    console.log(`RESULT: ${resultColor(msg)}`)
  },
  info (msg, replyCB) {
    if (typeof replyCB === 'function') {
      this.say(msg, replyCB)
    }
    console.log(`INFO: ${infoColor(msg)}`)
  },
  error (msg, replyCB) {
    if (typeof replyCB === 'function') {
      this.say(msg, replyCB)
    }
    console.log(`ERROR: ${errorColor(msg)}`)
  },
  write (msg, replyCB) {
    if (typeof replyCB === 'function') {
      this.say(msg, replyCB)
    }
    console.log(`WRITE: ${writeColor(msg)}`)
  },
  say (msg, replyCB) {
    replyCB(msg)
    this.info(`saying '${msg}'`)
  },
  react (msg, cb, emoji) {
    cb({name: emoji, channel: msg.channel, timestamp: msg.ts})
    this.info(`adding ${emoji} reaction to channel: ${msg.channel} and timestamp ${msg.ts}`)
  }
}
