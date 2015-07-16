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
    game.players.self.should.have.property('pos');
    game.players.self.id.should.equal('');
    game.players.self.state.should.equal('not-connected');
    game.players.self.online.should.equal(false);

    done();
  });

  it('should update physics (and process input) properly', function (done) { //Tests createPhysicsSimulation
    setTimeout(function () { //Pass initial setup
      game._pdt.should.be.above(0);
      var oldStateTime = game.players.self.stateTime;
      var oldStatePos = game.players.self.currentState.pos;
      var oldpdt = game._pdt;
      setTimeout(function () {
        game._pdt.should.not.equal(oldpdt); //Physics delta being changed
        game.players.self.currentState.pos.should.eql(oldStatePos); //We didn't give any input so position should stay same
        game.players.self.stateTime.should.not.equal(oldStateTime); //Check time is being updated

        //Simulate Keypress to test physics vector
        simulateKeypress(game, ['r']);
        setTimeout(function () {
          game.players.self.currentState.pos.x.should.equal(game.players.self.oldState.pos.x + (game.playerSpeed * 0.015).fixed(3));
          game.players.self.currentState.pos.y.should.equal(game.players.self.oldState.pos.y);

          simulateKeypress(game, ['l', 'l']);
          setTimeout(function () {

            game.players.self.currentState.pos.x.should.equal(game.players.self.oldState.pos.x - ((game.playerSpeed * 0.015).fixed(3) * 2));
            game.players.self.currentState.pos.y.should.equal(game.players.self.oldState.pos.y);

            simulateKeypress(game, ['l', 'r']);
            setTimeout(function () {
              game.players.self.currentState.pos.should.eql(game.players.self.oldState.pos);

              simulateKeypress(game, ['u']);
              setTimeout(function () {
                game.players.self.currentState.pos.x.should.equal(game.players.self.oldState.pos.x);
                game.players.self.currentState.pos.y.should.equal(game.players.self.oldState.pos.y - (game.playerSpeed * 0.015).fixed(3));

                simulateKeypress(game, ['d']);
                setTimeout(function () {
                  game.players.self.currentState.pos.x.should.equal(game.players.self.oldState.pos.x);
                  game.players.self.currentState.pos.y.should.equal(game.players.self.oldState.pos.y + (game.playerSpeed * 0.015).fixed(3));

                  done();
                }, 16);
              }, 16)
            }, 16)
          }, 16);
        }, 16)
      }, 16);
    }, 16);
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

  /*
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
    game.update(new Date().getTime());
    setTimeout(function () {
      game.players.self.currentState.pos.x.should.equal(game.players.self.oldState.pos.x - (game.playerSpeed * 0.015).fixed(3));
      game.players.self.currentState.pos.y.should.equal(game.players.self.oldState.pos.y);

      done();
    }, 15);
  });
  */

  it('should record client connection data correctly', function (done) {
    game.socket.on('onconnected', function (msg) {
      msg.id.should.equal(game.players.self.id);
      game.players.self.state.should.equal('connected');
      game.players.self.online.should.equal(true);

      done();
    });
  });

  it('should disconnect client correctly', function (done) {
    game.socket.on('onconnected', function () {
      game.socket.on('disconnect', function () {
        game.players.self.state.should.equal('not-connected');
        game.players.self.online.should.equal(false);
        done();
      });
      game.socket.disconnect();
    });
  });

  it('should change color on both clients', function (done) {
    var game2 = new gameCore(undefined, true);
    game2.socket.on('message', function (msg) {
      if (msg.startsWith('s.c')) {
        game2.socket.disconnect();

        msg.should.containEql("#000000");
        done();
      }
    });
    game.players.self.color = '#000000';
    game.socket.send('c.'+game.players.self.color);
  });

  it('should process server updates correctly',function(done) {
    var playerHost = game.players.self.host ? game.players.self : game.players.other;
    var playerClient = game.players.self.host ? game.players.other : game.players.self;
    var firstUpdate = true;
    var notMoved=true;
    game.socket.on('onserverupdate',function(data) {
      if(firstUpdate===true){firstUpdate=false; return;}
      playerHost = game.players.self.host ? game.players.self : game.players.other;
      playerClient = game.players.self.host ? game.players.other : game.players.self;

      if(notMoved==true) {
        data.hp.should.eql(playerHost.pos);;
        data.cp.should.eql(playerClient.pos);
        playerHost.pos.x = 100;
      }
      else{
        data.hp.x.should.equal(100);
        data.hp.y.should.equal(playerHost.pos.y);
        data.cp.should.eql(playerClient.pos);
      }
      done();
    })
  });

  it('should not allow players outside of the world', function (done) {
    var clone = function (obj) {
      var posL = obj.posLimits, pos = obj.pos;
      return {
        pos: {x: pos.x, y: pos.y},
        posLimits: {yMax: posL.yMax, yMin: posL.yMin, xMax: posL.xMax, xMin: posL.xMin}
      };
    };
    var item = game.players.self;
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
  });

});

function simulateKeypress(game,key) {
  game.inputSeq++;
  game.players.self.inputs.push({inputs: key, time: game.localTime.fixed(3), seq: game.inputSeq});
}