#!/bin/sh
#Run script while developing, rebuilds client, refreshes client and restarts server.

node ./node_modules/watchify/bin/cmd.js client/gameClient.js -o public/javascripts/game.js -dv & #Build browserify with sourcemaps, output when build finishes
node ./node_modules/onchange/cli.js public/javascripts/game.js -- python2 /home/matt/Documents/scripts/chrome-refresh-tabs/chromeRefresh.py 'localhost:3000' & #Refresh tabs on the webpage after browserify rebuild
node ./node_modules/nodemon/bin/nodemon.js bin/www.js #Restart server each time code changes
