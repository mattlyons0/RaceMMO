var should = require('should');
var io = require('socket.io-client');
var debug = require('debug')('RaceMMO:test:gameServer')
var port = 1234;
process.env.PORT = port;
var app = require('../bin/www'); //Start Server on port 1234 just for the tests

var socketURL = 'http://localhost:' + port;
var options = {
	transports: ['websocket'],
	'force new connection': true
};
describe('Game Server', function () {
	it("should assign uuids upon connection", function (done) {
		var client1 = connect();
		client1.on('onconnected', function (uuid) {
			uuid.should.have.property('id');
			debug('UUID: ' + uuid.id);
			client1.disconnect();
			done();
		});
	});

	it("should connect player to a lobby", function (done) {
		var client1 = connect();
		client1.on('message', function (message) {
			message.should.startWith('s.');
			debug("Connection Message: " + message);
			client1.disconnect();
			done();
		});
	});

	it("should connect 2 players to each other", function (done) {
		connect(function (client1) {
			var client2 = connect();
			logMessages([{client: client1, expected: 2}, {client: client2, expected: 2}], "message", function () {
				client1.messages[1].should.startWith("s.r.");
				client2.messages[0].should.startWith("s.j.");
				client2.messages[1].should.startWith("s.r.");

				client1.disconnect();
				client2.disconnect();
				done();
			});
		});
	});

	it("should handle player disconnection properly", function (done) {
		connect(function (client1) {
			var client2 = connect();
			logMessages([{client: client1, expected: 4}], "message", function () {
				client1.messages[2].should.startWith("s.e");
				client1.disconnect();
				connect(hostDisconnectTest);
			});
			client2.disconnect();
		});


		var hostDisconnectTest = function (client1) {
			var client2 = connect();
			client2.on('connect', function () {
				client1.disconnect();
			});
			logMessages([{client: client2, expected: 4}], "message", function () {
				client2.messages[2].should.startWith("s.e");
				client2.disconnect();
				done();
			});
		};

	});


});

/**
 * Will connect to socketIO server.
 * @param callback to be used if it must be connected before proceeding
 * @returns client if it doesn't have to be connected before proceeding
 */
function connect(callback) {
	var client = io.connect(socketURL, options);
	if(callback) {
		client.on('connect', function () {
			callback(client);
		});
	}
	return client;
}
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
function logMessages(clients, event, callback, debugEnabled) {
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
}