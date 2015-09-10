/**
 * Basic Gameserver Mechanics
 * Tests bin/www.js setupGameServer() and server/gameServer.js
 */

require('should');
var utils = require('./testUtils');
var debug = require('debug')('RaceMMO:test:gameServer');
require('../bin/www'); //Start Server just for the tests

describe('Game Server', function () {
  it('should assign uuids upon connection', function (done) {
    var client1 = utils.connect();
    client1.on('onconnected', function (uuid) {
      uuid.should.have.property('id');
      debug('UUID: ' + uuid.id);
      client1.disconnect();
      done();
    });
  });

  it('should connect player to a lobby', function (done) {
    var client1 = utils.connect();
    client1.on('message', function (message) {
      message.should.startWith('s.');
      debug('Connection Message: ' + message);
      client1.disconnect();
      done();
    });
  });

  it('should connect 2 players to each other', function (done) {
    utils.connect(function (client1) {
      var client2 = utils.connect();
      utils.logMessages([{client: client1, expected: 2}, {client: client2, expected: 2}], 'message', function () {
        client1.messages[0].split('.')[3].should.equal(client2.messages[0].split('.')[3]); //Should be put in same game lobby
        client1.messages[1].should.containEql(client2.userID); //Should be told about client2
        client2.messages[1].should.containEql(client1.userID); //Should be told about client1

        client1.disconnect();
        client2.disconnect();
        done();
      });
    });
  });

  it('should respond to ping messages', function (done) {
    var client1 = utils.connect();
    utils.logMessages([{client: client1, expected: 4}], 'message', function () {
      client1.messages[3].should.startWith('s.p.');
      client1.disconnect();
      done();
    });
    setTimeout(function () {
      client1.send('p.0'); //Send a fake ping message to the server
    }, 5);
  });

  it('should talk between 3 players correctly', function (done) {
    var client1 = utils.connect();
    var client2 = utils.connect();
    var client3 = utils.connect();

    utils.logMessages([{client: client1, expected: 3}, {client: client2, expected: 3}, {
      client: client3,
      expected: 3
    }], 'message', function () {
      var messages1 = client1.messages, messages2 = client2.messages, messages3 = client3.messages;
      messages1[0].split('.')[3].should.equal(messages2[0].split('.')[3]); //Should all connect to same server
      messages2[0].split('.')[3].should.equal(messages3[0].split('.')[3]);

      messages1[1].should.startWith('s.pl.j');
      messages1[2].should.startWith('s.pl.j');
      messages2[1].should.startWith('s.pl.j');
      messages2[2].should.startWith('s.pl.j');
      messages3[1].should.startWith('s.pl.j');
      messages3[2].should.startWith('s.pl.j');

      done();
    });
  });
});
