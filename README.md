# Node-Salesforce Integration
This is a sample for a Node-Salesforce integration. This allows you to hit both the `SOQL` and `REST` APIs exposed by Salesforce. For the `SOQL` queries, this allows the additional functionality of using SQL-like variables (as-in $1, $2, etc), protecting you from SQL injection.

## Connection Authentication Overview
This exposed object works by hitting an exposed Salesforce OAuth Endpoint, which you [must first create](https://help.salesforce.com/articleView?id=connected_app_create.htm&type=0). After doing so, providing the `CLIENT_SECRET` and `CLIENT_ID` from your OAuth endpoint, along with your `SALESFORCE_USERNAME` and `SALESFORCE_PASSWORD` (in `ensureConnected()`) for your administrator account will allow requests to be made to Salesforce.

The `ensureConnected()` function that handles authentication between Node and Salesforce, retrieves an OAuth token, which is saved on the object, then used to authenticate all future requests. If the token ever becomes expired, the upper layers set the connection flag to `false`, forcing this function to re-authenticate and save the new token.

## `SOQL` Query Usage
This is a very simple integration to use. You simply provide the query you'd like to execute in your Salesforce database, along with any params. For example, if you're looking to pull a specific `Account`, you can execute this query:
```
SELECT Name, Id FROM Account WHERE Id=$1
```
With the `Id` coming from the user. The whole implementation looks like this:
```js
const sfid = '1234567890'
const queryStr = 'SELECT Id, Name FROM Account WHERE Id = $1'

sf.sfConnection.query(queryStr, [sfid], function (error, accounts) {
  // ...
})
```