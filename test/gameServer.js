var should = require('should');
var io = require('socket.io-client');
var port=1234;
process.env.PORT = port;
var app = require('../bin/www'); //Start Server on port 1234 just for the tests

var socketURL = 'http://localhost:'+port;
var options = {
  transports: ['websocket'],
  'force new connection': true
};
describe('Game Server', function () {
  it("should assign uuids upon connection", function(done) {
    var client = connect();
    client.on('onconnected', function (uuid) {
      uuid.should.have.property('id');
      console.log('UUID: ' + uuid.id);
      client.disconnect();
      done();
    });
  });


});

function connect(){
  var client = io.connect(socketURL, options);
  return client;
}