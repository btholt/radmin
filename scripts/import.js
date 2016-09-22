const fs = require('fs')
const { connect } = require('mongodb').MongoClient
const configBuffer = fs.readFileSync('../config.json')
const config = JSON.parse(configBuffer)
const { mongoUsername, mongoPassword, mongoHost, mongoPath } = config.private[process.env.NODE_ENV]
const mongoUrl = `mongodb://${mongoUsername}:${mongoPassword}@${mongoHost}/${mongoPath}`
const dataBuffer = fs.readFileSync('../data.json')
const data = JSON.parse(dataBuffer)

const update = []
const used = new Set()

const former = data.former.map((admin) => {
  return { username: admin.username.toLowerCase(), isAdmin: false }
}).filter((admin) => {
  const username = admin.username
  if (used.has(username)) {
    return false
  } else {
    used.add(username)
    return true
  }
})

const admins = data.current.map((admin) => {
  return { username: admin.username.toLowerCase(), isAdmin: true }
}).filter((admin) => {
  const username = admin.username
  if (used.has(username)) {
    return false
  } else {
    used.add(username)
    return true
  }
}).concat(former)

connect(mongoUrl).then((db) => {
  console.log(`connected to ${mongoHost}/${mongoPath}`)
  const collection = db.collection('admins')
  return collection.insertMany(admins)
}).then((r) => {
  console.log(`inserted ${r.insertedCount} records`)
  process.exit(0)
}).catch((err) => {
  console.log(`ERROR ${err}`)
  throw err
  process.exit(1)
})
