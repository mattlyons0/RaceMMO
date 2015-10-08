/*
 Will connect the supplied integer, or the default clients to the server without creating gameCores for them (that would overload the host cpu)
 This will cause them to disconnect and reconnect after some time because the pings aren't being responded to... But can give an idea of what load looks like.
 */


process.env.PORT = 3000;
var utils = require('./testUtils');
var debug = require('debug')('RaceMMO:test:StressTest');
var app = require('../bin/www'); //Start Server just for the tests
var gameCore = require('../shared/gameCore');

var clients = 100;
if (process.argv.length > 2) {
  if (!Number.isNaN(Number(process.argv[2])))
    clients = Number(process.argv[2]);
}
app.gameServer.playerCap = clients * 2;


for (var i = 0; i < clients; i++) {
  //var game = new GameCore(undefined, true); //Tell them we are a fake client, omits drawing
  utils.connect(function (client) {
    //moveRandomly(game);
  });
}

function moveRandomly(game) { //use closure for game (gameCore)
  setInterval(function () {
    var keyArray = [];
    var randomNum = Math.floor(Math.random() * 5);
    var possibleKeys = ['l', 'r', 'u', 'd'];
    keyArray.push(possibleKeys[randomNum]);
    utils.simulateKeypress(game, keyArray);
  }, 100);
}
