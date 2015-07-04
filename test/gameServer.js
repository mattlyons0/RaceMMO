var test = require('should');
var io = require('socket.io-client');

var socketURL = 'localhost:3000';
var options = {
  transports: ['websocket'],
  'force new connection': true
};

describe('Game Server', function () {
  it('Should assign UUID upon connection', function(done) {
    var client = io.connect(socketURL, options);
    should(client).have.property('userID');
    var client2 = io.connect(socketURL, options);
    should.exist(client2.userID); //Check that UUID is assigned correctly
    client.disconnect();
    client2.disconnect();
    done();
  });
});