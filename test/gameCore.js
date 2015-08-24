/**
 * Game Mechanics
 * Tests shared/gameCore.js
 */
require('should');
var utils=require('./testUtils');
var debug = require('debug')('RaceMMO:test:gameCore');
var app=require('../bin/www'); //Start Server just for the tests
var gameCore = require('../shared/gameCore');
var game;

describe('Game Core Client', function () {

  beforeEach(function () {
    game = new gameCore(undefined, true); //Tell them we are a fake client
  });
  afterEach(function () {
    game.socket.disconnect();
  });

  it('should initialize clients properly', function (done) {
    game.server.should.be.false();
    game.should.have.property("world");
    game.playerSpeed.should.be.above(0); //Positive
    game.should.have.property('serverUpdates');
    game.should.have.property('socket');
    var self = game.players[game.socket.userID];
    self.should.have.property('pos');
    self.id.should.equal('');
    self.state.should.equal('not-connected');
    self.online.should.equal(false);

    done();
  });

  //TODO fix failing test due to initial position not being told over network correctly
  it('should update physics (and process input) properly', function (done) { //Tests createPhysicsSimulation
    setTimeout(function () { //Pass initial setup
      game._pdt.should.be.above(0);
      var oldStateTime = game.players[game.socket.userID].stateTime;
      var oldStatePos = game.players[game.socket.userID].currentState.pos;
      var oldpdt = game._pdte;
      setTimeout(function () {
        game._pdte.should.not.equal(oldpdt); //Physics delta being changed
        game.players[game.socket.userID].currentState.pos.should.eql(oldStatePos); //We didn't give any input so position should stay same
        game.players[game.socket.userID].stateTime.should.not.equal(oldStateTime); //Check time is being updated

        oldStatePos = game.players[game.socket.userID].oldState.pos;
        //Simulate Keypress to test physics vector
        simulateKeypress(game, ['r']);
        setTimeout(function () {
          game.players[game.socket.userID].currentState.pos.x.should.equal(oldStatePos.x + (game.playerSpeed * 0.015).fixed(3));
          game.players[game.socket.userID].currentState.pos.y.should.equal(oldStatePos.y);

          oldStatePos = game.players[game.socket.userID].oldState.pos;
          simulateKeypress(game, ['l', 'l']);
          setTimeout(function () {

            game.players[game.socket.userID].currentState.pos.x.should.equal((oldStatePos.x - ((game.playerSpeed * 0.015) * 2)).fixed(3));
            game.players[game.socket.userID].currentState.pos.y.should.equal(oldStatePos.y);

            oldStatePos = game.players[game.socket.userID].oldState.pos;
            simulateKeypress(game, ['l', 'r']);
            setTimeout(function () {
              game.players[game.socket.userID].currentState.pos.should.eql(oldStatePos);

              oldStatePos = game.players[game.socket.userID].oldState.pos;
              simulateKeypress(game, ['u']);
              setTimeout(function () {
                game.players[game.socket.userID].currentState.pos.x.should.equal(oldStatePos.x);
                game.players[game.socket.userID].currentState.pos.y.should.equal(oldStatePos.y - (game.playerSpeed * 0.015).fixed(3));

                oldStatePos = game.players[game.socket.userID].oldState.pos;
                simulateKeypress(game, ['d']);
                setTimeout(function () {
                  game.players[game.socket.userID].currentState.pos.x.should.equal(oldStatePos.x);
                  game.players[game.socket.userID].currentState.pos.y.should.equal(oldStatePos.y + (game.playerSpeed * 0.015).fixed(3));

                  done();
                }, 35);
              }, 35)
            }, 35)
          }, 35);
        }, 35)
      }, 35);
    }, 40);
  });

  it('should update time correctly', function (done) {
    var oldTime = game.localTime;
    setTimeout(function () {
      game.localTime.should.not.equal(oldTime);
      game.localTime.should.be.above(0);

      done();
    }, 4);
  });

  it('should ping server regularly', function (done) {
    var lastPing = game.lastPingTime;
    setTimeout(function () {
      game.lastPingTime.should.not.equal(lastPing);
      game.netPing.should.be.below(10); //Since we are locally pinging server ping should be low
      done();
    }, 1000);
  });

  it('should handle input correctly', function (done) {
    game.keyboard = {};
    var pressed = false;
    game.keyboard.pressed = function (key) {
      if (!pressed && key === "left") {
        pressed = true;
        return true;
      }
      return false;
    };
    setTimeout(function () {
      game.players[game.socket.userID].currentState.pos.x.should.equal(game.players[game.socket.userID].oldState.pos.x - (game.playerSpeed * 0.015).fixed(3));
      game.players[game.socket.userID].currentState.pos.y.should.equal(game.players[game.socket.userID].oldState.pos.y);

      done();
    }, 15);
  });

  it('should record client connection data correctly', function (done) {
    game.socket.on('onconnected', function (msg) {
      msg.id.should.equal(game.players[game.socket.userID].id);
      game.players[game.socket.userID].state.should.equal('YOU');
      game.players[game.socket.userID].online.should.equal(true);

      done();
    });
  });

  it('should disconnect client correctly', function (done) {
    game.socket.on('onconnected', function () {
      game.socket.on('disconnect', function () {
        game.players[game.socket.userID].state.should.equal('not-connected');
        game.players[game.socket.userID].online.should.equal(false);
        done();
      });
      game.socket.disconnect();
    });
  });

  it('should change color on both clients', function (done) {
    var game2 = new gameCore(undefined, true);
    game2.socket.on('message', function (msg) {
      debug(msg);
      if (msg.startsWith('s.pl.c.')) {
        game2.socket.disconnect();

        msg.should.containEql("#000000");
        done();
      }
    });
    game.players[game.socket.userID].color = '#000000';
    game.socket.send('c.'+game.players[game.socket.userID].color);
  });

  it('should process server updates correctly',function(done) {
    var player1 = game.socket.userID;
    var player2 = new gameCore(undefined,true);

    var firstUpdate = true;
    var test1 = false, test2 = false;
    game.socket.on('onserverupdate', function (data) {
      if (firstUpdate === true) {
        firstUpdate = false;
        return;
      }
      for (var i = 0; i < data.pl.length; i++) {
        var player = data.pl[i];
        if (player.id === player1) {
          player.pos.should.eql(game.players[player1].pos);
        }
        else if (player.id === player2.id) {
          player.pos.should.eql(player2.pos);
        }
      }
      test1 = true;
      if(test2===true) {
        player2.socket.disconnect();
        done();
      }
    });

    //Test converting into an associative array from socketIO regular array
    setTimeout(function () {
      player1=game.socket.userID;
      var update=game.serverUpdates[game.serverUpdates.length-1]; //Get most recent update
      update.pl[player1].should.have.property('pos');
      update.pl[player2.socket.userID].should.have.property('pos');
      test2 = true;
      if(test1===true) {
        player2.socket.disconnect();
        done();
      }
    }, 45); //Wait for server tick
  });

  it('should not allow players outside of the world', function (done) {
    var clone = function (obj) {
      var posL = obj.posLimits, pos = obj.pos;
      return {
        pos: {x: pos.x, y: pos.y},
        posLimits: {yMax: posL.yMax, yMin: posL.yMin, xMax: posL.xMax, xMin: posL.xMin}
      };
    };

    setTimeout(function () {
      var item = game.players[game.socket.userID];
      var maxY = item.posLimits.yMax, minY = item.posLimits.yMin, minX = item.posLimits.xMin, maxX = item.posLimits.xMax;


      item.pos.x = maxX - 0.0001;
      var cloneI = clone(item);
      game.checkCollision(cloneI);
      debug(item.pos.x + " " + cloneI.pos.x);
      item.pos.x.should.equal(cloneI.pos.x);
      item.pos.y.should.equal(cloneI.pos.y);

      item.pos.x = maxX;
      item.pos.y = maxY;
      cloneI = clone(item);
      game.checkCollision(cloneI);
      cloneI.pos.x.should.equal(item.pos.x);
      cloneI.pos.y.should.equal(item.pos.y);

      item.pos.x = minX;
      item.pos.y = minY;
      cloneI = clone(item);
      game.checkCollision(cloneI);
      cloneI.pos.x.should.equal(item.pos.x);
      cloneI.pos.y.should.equal(item.pos.y);

      item.pos.x = minX - 10;
      item.pos.y = maxY + 10;
      cloneI = clone(item);
      game.checkCollision(cloneI);
      cloneI.pos.x.should.equal(minX);
      cloneI.pos.y.should.equal(maxY);

      done();
    },15); //Skip first tick

  });

  it('should process network updates correctly', function (done) {
    game.update(new Date().getTime());
    var game2 = new gameCore(undefined, true);
    var client2 = game2.socket;
    simulateKeypress(game2, ['u', 'r', 'r', 'r']);
    setTimeout(function () {
      var target = game.serverUpdates[game.serverUpdates.length - 1];
      var previous = game.serverUpdates[game.serverUpdates.length - 2];

      debug(target);
      debug(client2.userID);
      //Linear interpolation between the last 2 server updates for the other client (the non host)
      game.ghosts.posOther[client2.userID].pos.x.should.be.approximately(game.vLerp(previous.pl[client2.userID].pos, target.pl[client2.userID].pos, ((game.targetTime - game.clientTime) / (target.t - previous.t)).fixed(3)).x, 5); //Completely based upon timing, this the approximately
      game.ghosts.posOther[client2.userID].pos.y.should.be.approximately(game.vLerp(previous.pl[client2.userID].pos, target.pl[client2.userID].pos, ((game.targetTime - game.clientTime) / (target.t - previous.t)).fixed(3)).y, 5);
      game.players[client2.userID].pos.x.should.be.approximately(game.vLerp(game.players[client2.userID].pos, game.ghosts.posOther[client2.userID].pos, game._pdt * game.clientSmooth).x,15);
      game.players[client2.userID].pos.y.should.be.approximately(game.vLerp(game.players[client2.userID].pos, game.ghosts.posOther[client2.userID].pos, game._pdt * game.clientSmooth).y,15);
      //Client smoothing

      client2.disconnect();
      done();
    }, 40);
  });
});

describe('Game Core Server', function () {
  it('should initialize properly', function (done) {
    utils.connect(function (client) {
      var game = app.gameServer.recentGame;
      var core = game.gameCore;
      core.instance.should.eql(game);
      core.server.should.equal(true);
      var userID;
      for(var player in game.players){
        if(game.players.hasOwnProperty(player)){
          userID = player;
          break;
        }
      }
      core.players[userID].instance.should.equal(game.players[userID]);

      client.disconnect();
      done();
    });
  });

  it('should update physics properly', function (done) { //Merely tests physics timing update
    utils.connect(function (client) {
      var core = app.gameServer.recentGame.gameCore;
      setTimeout(function () { //Avoid first tick
        var oldpdt = core._pdte;
        setTimeout(function () {
          core._pdte.should.not.equal(oldpdt); //Check if timer works

          client.disconnect();
          done();
        }, 16);
      }, 16);
    });
  });

  it('should process inputs correctly', function (done) {
    game = new gameCore(undefined, true); //Tell them we are a fake client
    game.socket.on('connect', function () {
      var core = app.gameServer.recentGame.gameCore;
      setTimeout(function () { //First Physics Tick
        simulateKeypress(game, ['d']);
        var oldState = core.players[game.socket.userID].pos;
        setTimeout(function () {
          core.players[game.socket.userID].pos.x.should.equal(oldState.x);
          core.players[game.socket.userID].pos.y.should.equal(oldState.y + (game.playerSpeed * 0.015).fixed(3));

          oldState = core.players[game.socket.userID].pos;
          simulateKeypress(game, ['l']);
          setTimeout(function () {
            core.players[game.socket.userID].pos.x.should.equal(oldState.x - (game.playerSpeed * 0.015).fixed(3));
            core.players[game.socket.userID].pos.y.should.equal(oldState.y);

            oldState = core.players[game.socket.userID].pos;
            simulateKeypress(game, ['u', 'l', 'd', 'r']); //Shouldn't move after this sequence
            setTimeout(function () {
              core.players[game.socket.userID].pos.x.should.equal(oldState.x);
              core.players[game.socket.userID].pos.y.should.equal(oldState.y);

              game.socket.disconnect();
              done();
            }, 35);
          }, 35);
        }, 35);
      }, 35);
    });
  });

  it('should update time correctly', function (done) {
    utils.connect(function (client) {
      var core = app.gameServer.recentGame.gameCore;
      setTimeout(function () { //Avoid First Tick
        var localTime = core.serverTime;
        setTimeout(function () {
          core.serverTime.should.be.above(localTime);

          client.disconnect();
          done();
        }, 5);
      }, 5);
    });
  });

  it('should send updates to clients properly', function (done) {
    var isDone = false;
    utils.connect(function (client) {
      var core = app.gameServer.recentGame.gameCore;
      var called = false;
      client.on('onserverupdate', function (update) {
        if(called===true) return;
        called = true;
        update.pl.length.should.be.approximately(1,1);
        var id;
        for(var player in core.players){
          if(core.players.hasOwnProperty(player)){
            id = player;
            break;
          }
        }
        update.pl[0].pos.should.eql(core.players[player].pos);
        update.t.should.be.approximately(core.serverTime,0.25); //Should be within a quarter of a second of eachother (there should be little/no latency)

        var client2 = utils.connect();
        client2.on('onserverupdate', function (msg) {
          for(var i=0;i<msg.pl.length;i++){
            var player=msg.pl[i];
            if(player.id===id){
              player.pos.should.eql(core.players[player.id].pos);
            }
            else if(player.id===client2.userID){
              update.pos.should.eql(core.players[client2.userID].pos);
            }
          }
          update.t.should.be.below(core.serverTime); //Since we are within 2 closures core is now cached

          client.disconnect();
          client2.disconnect();
          isDone = true;
        });
      });
    });
    var interval=setInterval(function () { //Ensure done isn't called twice because that crashes mocha
      if(isDone===true) {
        done();
        clearInterval(interval);
      }
    }, 25);
  });
});

function simulateKeypress(game,key) {
  game.clientHandleInput(key);
}