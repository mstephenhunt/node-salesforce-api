'use strict'

const request = require('request')
const moment = require('moment')
const sqlString = require('sqlstring')

const maxReattempts = process.env.SALESFORCE_RECONNECT_ATTEMPTS

class SalesforceConnection {

  constructor () {
    this.instance_url = ''
    this.access_token = ''
    this.connected = false
    this.reattempts = 0
  }

  // ===== REST Methods ====== //
  // Takes: method, resourceType, resourceId, body
  restAction (options, callback) {
    const method = options.method
    var resourceURI = '/' + options.resourceType
    var body = ''

    // If you were provided an Id, append it
    if (options.resourceId) {
      resourceURI += '/' + options.resourceId
    }

    // If you were provided a body, put it in
    if (options.body) {
      body = options.body
    }

    this.ensureConnected((error) => {
      if (error) {
        callback(error)
      } else {
        const fullURI = this.instance_url + process.env.SALESFORCE_REST_API + resourceURI

        // Send the request with method-specific settings
        request(this.setRequestParams({
          method: method,
          fullURI: fullURI,
          body: body
        }), (error, response, body) => {
          if (error) {
            callback(error)
          } else if (body && body[0] && body[0].errorCode === 'INVALID_SESSION_ID') {
            // If this happens, you probably have an expired key. Get new connection
            // creds and reattempt with recursive call
            this.connected = false

            if (this.reattempts < maxReattempts) {
              this.reattempts++
              this.restAction(options, (error, response) => {
                if (error) {
                  callback(error)
                } else {
                  this.reattempts = 0
                  callback(null, response)
                }
              })
            } else {
              // Reattempted too many times, just return the error
              body[0].errorDescription = 'Got back INVALID_SESSION_ID from SF. ' + this.reattempts + ' attempt(s) tried to get new key.'
              this.reattemps = 0
              callback(body)
            }
          } else if (body && body[0] && body[0].errorCode) {
            // This contains any Salesforce validations (think email format, required fields, etc)
            callback(body)
          } else {
            if (body) {
              var returnBody = body

              // If the body needs to be parsed, then parse it
              if (typeof body !== 'object') {
                returnBody = JSON.parse(body)
              }

              callback(null, returnBody)
            } else {
              callback(null, 'Success')
            }
          }
        })
      }
    })
  }

  setRequestParams (options) {
    // These settings are true for all method types
    var request = {
      method: options.method,
      url: options.fullURI,
      headers: {
        Authorization: 'Bearer ' + this.access_token
      }
    }

    // If a body was provided, append it and set header to application/json
    if (options.body) {
      request.body = options.body
      request.json = true
    }

    return request
  }

  // ====== Direct Queries ====== //
  query (query, params, callback) {
    if (typeof params === 'function') {
      callback = params
      params = null
    }

    // If there are params, substitute them into the SOQL query: replace $1, $2.
    // SOQL doesn't seem to support the $1, $2 syntax for dynamic values
    var replacedQuery = this.replaceSQLVariables(query, params)

    this.executeQuery(replacedQuery, function (error, response) {
      if (error) {
        callback(error)
      } else {
        callback(null, response)
      }
    })
  }

  executeQuery (query, callback) {
    this.ensureConnected((error) => {
      if (error) {
        callback(error)
      } else {
        // To execute the query, we need to replace the spaces with '+' then tag on the rest of the url
        const formattedQuery = encodeURIComponent(query)
        const fullQuery = this.instance_url + process.env.SALESFORCE_SERVICE_QUERY + formattedQuery

        // FOR TESTING ONLY!
        // if (this.reattempts < 1) {
        //   this.access_token = 'crap'
        // }

        request.get(fullQuery, {
          headers: {
            Authorization: 'Bearer ' + this.access_token
          }
        }, (error, response, body) => {
          // Pull out the body if it exists, sometimes it contains error messages
          var parsedBody = ''
          if (body) {
            parsedBody = JSON.parse(body)
          }

          if (error) {
            callback(error)
          } else if (parsedBody[0] && parsedBody[0].errorCode === 'INVALID_SESSION_ID') {
            // If this happens, you probably have an expired key. Get new connection
            // creds and reattempt with recursive call
            this.connected = false

            if (this.reattempts < maxReattempts) {
              this.reattempts++
              this.executeQuery(query, (error, response) => {
                if (error) {
                  callback(error)
                } else {
                  this.reattempts = 0
                  callback(null, response)
                }
              })
            } else {
              // Reattempted too many times, just return the error
              parsedBody.errorDescription = 'Got back INVALID_SESSION_ID from SF. ' + this.reattempts + ' attempt(s) tried to get new key.'
              this.reattemps = 0
              callback(parsedBody.errorCode)
            }
          } else {
            callback(null, parsedBody.records)
          }
        })
      }
    })
  }

  replaceSQLVariables (query, params) {
    var replacedQuery = query

    if (params) {
      params.forEach(function (element, index) {
        let regex = new RegExp('\\$' + (index + 1) + '(?![0-9])')

        // If you're adding in a string, put in single quotes. If date, format element to be YYYY-MM-DD
        if (element instanceof moment) {
          element = element.format('YYYY-MM-DD')
        }

        // Sanatise input, place into query
        let escapedParam = sqlString.escape(element)
        replacedQuery = replacedQuery.split(regex).join(escapedParam)
      })
    }

    return replacedQuery
  }

  ensureConnected (callback) {
    if (!this.connected) {
      // Set the authorizing params needed for future requests
      request.post(process.env.SALESFORCE_ENDPOINT, {
        form: {
          grant_type: 'password',
          client_id: process.env.SALESFORCE_CLIENT_ID,
          client_secret: process.env.SALESFORCE_CLIENT_SECRET,
          username: process.env.SALESFORCE_USERNAME,
          password: process.env.SALESFORCE_PASSWORD
        }
      }, (error, response, authParams) => {
        const bodyJSON = JSON.parse(authParams)

        if (error) {
          callback(error)
        } else if (bodyJSON.error) {
          callback(bodyJSON.error)
        } else {
          this.instance_url = bodyJSON.instance_url
          this.access_token = bodyJSON.access_token
          this.connected = true
          callback(null)
        }
      })
    } else {
      callback(null)
      return
    }
  }
}

const sfConnection = new SalesforceConnection()

module.exports = { sfConnection }
