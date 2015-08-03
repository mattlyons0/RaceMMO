var debug = require('debug')('RaceMMO:test:testUtils')
var io = require('socket.io-client');
var options = {
  transports: ['websocket'],
  'force new connection': true
};

/**
 * Will connect to socketIO server.
 * @param callback to be used if it must be connected before proceeding
 * @returns client if it doesn't have to be connected before proceeding
 */
this.connect = function (callback) {
  var client = io.connect('http://localhost:' + process.env.PORT, options);
  if (callback) {
    client.on('connect', function () {
      callback(client);
    });
  }
  return client;
};
String.prototype.startsWith = function (str) {
  if (str.length > this.length) {
    return false;
  }
  for (var x = 0; x < this.length; x++) {
    if (x === str.length) {
      return true;
    }
    if (this.charAt(x) !== str.charAt(x)) {
      return false;
    }
  }
  return false;
};
/**
 * Log all messages recived at given websocket clients
 * @param clients array of: {client: websocketClient, expected: number of messages to be met before going to callback}
 * @param event string of event to log messages for
 * @param callback function to callback to after all expected values are met.
 * @param debugEnabled prints debug information about when the callback is called
 *
 * Messages are logged as websocketClient.messages in an array
 */
this.logMessages = function (clients, event, callback, debugEnabled) {
  for (var x = 0; x < clients.length; x++) {
    var clientData = clients[x];
    var client = clientData.client;
    var expected = clientData.expected;

    client.messages = [];
    (function (index) {
      client.on(event, function (msg) {
        var client = clients[index].client;
        client.messages.push(msg);

        if (client.messages.length >= expected) {
          if (debugEnabled) {
            debug("Client " + index + " has met " + expected);
          }
          for (var x = 0; x <= clients.length; x++) {
            if (x === clients.length) {
              callback();
              callback = null;
              return;
            }
            if (clients[x].client.messages.length < clients[x].expected) {
              return;
            }
          }
        }
      });
    })(x);
  }
};
module.exports = this;