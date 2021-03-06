'use strict'

const express = require('express')
const supertest = require('supertest')
const expect = require('chai').expect
const mongoose = require('mongoose')
const mockgoose = require('mockgoose')
const subleaseMiddleware = require('../express')

const Mongoose = mongoose.Mongoose

const wrap = (fn) => {
  return (req, res, next) => {
    try { return fn(req, res, next) }
    catch (ex) { return next(ex) }
  }
}

describe('mongoose-model', () => {

  function getRequest(options) {
    const app = express()
    app.use(subleaseMiddleware(
      options.rootConnection,
      options.models,
      options.options
    ))
    if (options.middleware) app.use(wrap(options.middleware))
    app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
      res.send(err.message)
    })
    return supertest(app)
  }

  let myMongoose
  const testSchema = new mongoose.Schema({
    name: String,
  })
  testSchema.static('test', (val) => val)

  beforeEach(() => {
    myMongoose = new Mongoose()
    myMongoose.Promise = Promise
    return mockgoose(myMongoose).then(() => {
      return myMongoose.connect('mongodb://example.com/test')
    })
  })

  afterEach((done) => {
    myMongoose.unmock(done)
  })

  it('applies models', () => {
    const middleware = (req, res) => {
      const Test = req.model('Test')
      expect(req.tenant).to.be.equal('test')
      expect(Test).to.have.property('test')
      res.send(Test.test('test'))
    }
    const request = getRequest({
      rootConnection: myMongoose.connection,
      models: { Test: testSchema },
      middleware,
    })
    return request
      .get('/')
      .expect(200, 'test')
  })

  it('has custom model key', () => {
    const middleware = (req, res) => {
      expect(req).to.not.have.property('model')
      const Test = req.getModel('Test')
      expect(Test).to.have.property('test')
      res.send(Test.test('test'))
    }
    const request = getRequest({
      rootConnection: myMongoose.connection,
      models: { Test: testSchema },
      options: {
        modelKey: 'getModel',
      },
      middleware,
    })
    return request
      .get('/')
      .expect(200, 'test')
  })

  it('supports multiple database connections', () => {
    const middleware = (req, res) => {
      const Test = req.model('Test')
      expect(Test).to.have.property('test')
      res.send(Test.test(req.tenant))
    }
    const request = getRequest({
      rootConnection: myMongoose.connection,
      models: { Test: testSchema },
      options: {
        getDbName: (req) => req.path.substr(1),
      },
      middleware,
    })
    return request
      .get('/foo')
      .expect(200, 'foo')
      .then(() => {
        return request
          .get('/bar')
          .expect(200, 'bar')
      })
      .then(() => {
        return request
          .get('/foo')
          .expect(200, 'foo')
      })
  })

  it('works without models', () => {
    const middleware = (req, res) => {
      expect(Object.keys(req.connection.models)).to.have.length(0)
      res.send('success')
    }
    const request = getRequest({
      rootConnection: myMongoose.connection,
      middleware,
    })
    return request
      .get('/')
      .expect(200, 'success')
  })

})
