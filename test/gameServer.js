/**
 * Basic Gameserver Mechanics
 * Tests bin/www.js setupGameServer() and server/gameServer.js
 */

require('should');
var utils=require('./testUtils');
var debug = require('debug')('RaceMMO:test:gameServer');
require('../bin/www'); //Start Server just for the tests

describe('Game Server', function () {
	it("should assign uuids upon connection", function (done) {
		var client1 = utils.connect();
		client1.on('onconnected', function (uuid) {
			uuid.should.have.property('id');
			debug('UUID: ' + uuid.id);
			client1.disconnect();
			done();
		});
	});

	it("should connect player to a lobby", function (done) {
		var client1 = utils.connect();
		client1.on('message', function (message) {
			message.should.startWith('s.');
			debug("Connection Message: " + message);
			client1.disconnect();
			done();
		});
	});

	it("should connect 2 players to each other", function (done) {
    utils.connect(function (client1) {
			var client2 = utils.connect();
      utils.logMessages([{client: client1, expected: 2}, {client: client2, expected: 2}], "message", function () {
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
    utils.connect(function (client1) {
			var client2 = utils.connect();
      utils.logMessages([{client: client1, expected: 4}], "message", function () {
				client1.messages[2].should.startWith("s.e");
				client1.disconnect();
        utils.connect(hostDisconnectTest);
			});
			client2.disconnect();
		});


		var hostDisconnectTest = function (client1) {
			var client2 = utils.connect();
			client2.on('connect', function () {
				client1.disconnect();
			});
      utils.logMessages([{client: client2, expected: 4}], "message", function () {
				client2.messages[2].should.startWith("s.e");
				client2.disconnect();
				done();
			});
		};

	});

  it('should respond to ping messages', function (done) {
    var client1 = utils.connect();
    utils.logMessages([{client: client1, expected: 2}], "message", function () {
      client1.messages[1].should.startWith("s.p.");
      client1.disconnect();
      done();
    });
    client1.send('p.0'); //Send a fake ping message to the server
  });
});