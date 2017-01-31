// ==UserScript==
// @name         SlitherAI - Bot
// @namespace    SlitherAI
// @version      0.1.2
// @description  Controlling all the snakes!
// @author       Alberto Sola
// @match        http://slither.io/
// @grant        none
// ==/UserScript==

// ----------------------------------------------------------------------------------

//var ENABLE_BOT_KEY = 83;     // 'S' - ASCII
//var ENABLE_VISUAL_INFO_KEY;

// ----------------------------------------------------------------------------------

var UPDATE_INTERVAL = 60;

// ----------------------------------------------------------------------------------

var bot_name = "Slither.AI";
var bot_enabled = true;
var mouse_enabled = true;
var nick_input_id = "nick";
var autoplay = false;

// ----------------------------------------------------------------------------------

var direction = 0;

var objective_offset = 40;
var direction_offset = 20;

var goto_x = 0;
var goto_y = 0;
var has_objective = false;

// TODO: set game coordinates -> convert when drawing
var front_radius = 150;
var front_angle = Math.PI/1.5;
var near_snakes = [];

var scape_mode = false;

// ----------------------------------------------------------------------------------

var game_redraw = null;
var start_game = null;
var capture_mouse = null;

// ----------------------------------------------------------------------------------

function disableDrawing(){
    window.redraw = function(){};
}

// ----------------------------------------------------------------------------------

function disableMouse(){
    window.onmousemove = function(){};
}

function enableMouse(){
    window.onmousemove = capture_mouse;
}

function overridePlayButton(){
    var play_bttn = document.getElementsByClassName("sadg1")[0];
    start_game = play_bttn.onclick;
    play_bttn.onclick = startGame;
    
}

// ----------------------------------------------------------------------------------

/// TODO: Override Play Button
function startGame(){
    /*
        Start the game.
    */
    //document.getElementById("playh").children[0].click();
    
    bot_enabled = true;
    console.log("STARTING");

    // Wait until the conexion is stablished
    start_game();
    setTimeout(update,1000);
}

// ----------------------------------------------------------------------------------

function setNick(nick){
    /*
        Set the bot nick in the input field.
    */
    var nick_input = document.getElementById(nick_input_id);
    nick_input.setAttribute("value", nick);
}

// ----------------------------------------------------------------------------------

// TODO: Search how it works.
function sendData(data){
    /*
        Send data to the server.
    */
    var packet = new Uint8Array(1);
    packet[0] = data;
    ws.send(packet);
}

// ----------------------------------------------------------------------------------

function getDistance(a,b,c,d){
    /*
        Calculate the distance between (a,b) and (c,d).
    */
    var x = a - c;
    var y = b - d;

    return Math.sqrt(x*x+y*y);
}

// ----------------------------------------------------------------------------------

function radToGameAngle(angle){
    var new_direction;

    if(angle > 0)
        new_direction = (1 - angle/Math.PI) * 125 + 125;
    else
        new_direction = -angle/Math.PI * 125;

    return Math.round(new_direction);
}

// ----------------------------------------------------------------------------------

function getDirectionScape(){
    /*
        Go to the oposite direction if there are near snakes.
        
        [WIP]
        
        TODO: Sometimes fails.
    */
    var angles = [];
    var min_angle = 250;
    var max_angle = 0;

    for(var i = 0; i < near_snakes.length; i++){
        if(near_snakes[i].ang > max_angle)
            max_angle = near_snakes[i].ang;
        else if(near_snakes[i].ang < min_angle)
            min_angle = near_snakes[i].ang;

    }

    return (125 + (max_angle+min_angle)/2)%250;
}

// ----------------------------------------------------------------------------------

function getDirection(x,y){
    /*
        Calculate the direction [0,250] to go to the current objective.
    */
    var my_x = snake.xx;
    var my_y = snake.yy;

    var moved_x = x - my_x;
    var moved_y = - y + my_y;


    var angle = Math.atan2(moved_y,moved_x);

    return radToGameAngle(angle);
}

// ----------------------------------------------------------------------------------

function get_next_food(){
    /*
        Set the coordinates of the next objective.
        
        TODO: Check if there isn't any snake over it or if it's behind a snake.
    */
    var my_x = snake.xx;
    var my_y = snake.yy;
    var food_x = null;
    var food_y = null;
    var small_distance;
    var next_food_x;
    var next_food_y;
    var next_distance;

    // TODO: new angle -> the less the better
    // TODO: new angle -> don't go to danger zone
    if(foods.length > 0){
        food_x = foods[0].xx;
        food_y = foods[0].yy;
        small_distance = foods[0].sz*foods[0].sz / getDistance(my_x,my_y,food_x,food_y);
    }

    for(var i = 1; i < foods.length; i++){
        if( foods[i] !== null && goto_x != foods[i].xx && goto_y != foods[i].yy){
            next_food_x = foods[i].xx;
            next_food_y = foods[i].yy;
            next_distance = foods[i].sz*foods[i].sz / (getDistance(my_x,my_y,next_food_x,next_food_y) + Math.abs(direction - getDirection(my_x,my_y,next_food_x,next_food_y)));

            if(next_distance > small_distance){
                small_distance = next_distance;
                food_x = next_food_x;
                food_y = next_food_y;
            }
            
        }
    }

    goto_x = food_x;
    goto_y = food_y;
}

// ----------------------------------------------------------------------------------

function objectiveEaten(){
    /*
        Check if the current objective has been eaten.
    */
    var eaten = false;

    for(var i = 0; i < foods.length && !eaten; i++){
        if( foods[i] !== null && foods[i].xx == goto_x && foods[i].yy == goto_y )
            eaten = true;
    }

    return !eaten;
}

// ----------------------------------------------------------------------------------

function update(){
    /*
        Main function.
    */
    if(ws === null){
        bot_enabled = false;
        console.log("GAME OVER");
    }

    if(bot_enabled){

        var my_x = snake.xx;
        var my_y = snake.yy;

        if( Math.abs(Math.abs(my_x) - Math.abs(goto_x)) < objective_offset && Math.abs(Math.abs(my_y) - Math.abs(goto_y)) < objective_offset )
            has_objective = false;

        if( direction%62 < direction_offset) // 62 = 250/4 = 90º
            has_objective = false;

        if(objectiveEaten())
            has_objective = false;

        searchSnakes();

        if(scape_mode){
            direction = getDirectionScape();
        }
        else{
            if(!has_objective){
                get_next_food();
                has_objective = true;
            }
            direction = getDirection(goto_x,goto_y);

        }

        sendData(direction);
        draw();

        setTimeout(update,UPDATE_INTERVAL);
    }
}

// ----------------------------------------------------------------------------------

function drawLine(ctx,start_x,start_y,end_x,end_y){
    /*
        Draw a line in a canvas context.
    */
    ctx.moveTo(start_x,start_y);
    ctx.lineTo(end_x,end_y);
    ctx.stroke();
}

// ----------------------------------------------------------------------------------

function searchSnakes(){
    /*
        Search for points inside an area (enemy_radius).
    */
    var distance;
    var enemy_pos_angle;
    near_snakes = [];
    
    // TODO: Check null elements
    for(var i = 0; i < snakes.length - 1; i++){ // Our snake is the last one
        for(var j = 0; j < snakes[i].pts.length; j++){ // There are some hidden points -> "dying = true"
            
            distance = getDistance(snake.xx,snake.yy,snakes[i].pts[j].xx,snakes[i].pts[j].yy);
            
            if(!snakes[i].pts[j].dying){
                
                enemy_pos_angle = getDirection(snakes[i].pts[j].xx,snakes[i].pts[j].yy) * 2 * Math.PI / 250; 
                
                if(distance <= front_radius && enemy_pos_angle < snake.ang + front_angle && enemy_pos_angle > snake.ang - front_angle)
                    near_snakes.push({x:snakes[i].pts[j].xx,y:snakes[i].pts[j].yy,ang: enemy_pos_angle});
                
            }
                
        }
    }
    
    //console.log(near_snakes.length);

    if(near_snakes.length > 0 )
        scape_mode = true;
    else
        scape_mode = false;

}

// ----------------------------------------------------------------------------------

function draw(){
    /*
        Render the game and the aditional bot info.
    */
    game_redraw();

    var context = window.mc.getContext('2d');
    var mid_x = window.mc.width/2;
    var mid_y = window.mc.height/2;
    var my_x = snake.xx;
    var my_y = snake.yy;
    var obj_x = Math.round((goto_x - my_x)*window.gsc + mid_x);
    var obj_y = Math.round((goto_y - my_y)*window.gsc + mid_y);

    context.save();
    //context.globalAlpha = 1;
    context.beginPath();
    context.rect(obj_x, obj_y, 10,10);

    context.strokeStyle = "black";
    context.fillStyle = "white";
    context.stroke();
    context.fill();

    context.beginPath();
    context.lineWidth = 2;
    context.strokeStyle = "white";
    drawLine(context,mid_x,mid_y,obj_x+5,obj_y+5);
    
    context.beginPath();
    context.moveTo(mid_x,mid_y);
    if(scape_mode)
        context.strokeStyle = "red";
    else
        context.strokeStyle = "green";
    context.arc(mid_x,mid_y,front_radius*window.gsc, snake.ang - front_angle, snake.ang + front_angle);
    context.lineTo(mid_x,mid_y);
    context.stroke();


    for(var i = 0; i < near_snakes.length; i++){
        context.beginPath();
        context.strokeStyle = "red";
        context.fillStyle = "red";
        obj_x = Math.round((near_snakes[i].x - my_x)*window.gsc + mid_x);
        obj_y = Math.round((near_snakes[i].y - my_y)*window.gsc + mid_y);

        context.rect(obj_x, obj_y, 10,10);
        context.stroke();
        context.fill();

        context.lineWidth = 2;
        context.strokeStyle = "red";
        drawLine(context,mid_x,mid_y,obj_x+5,obj_y+5);
    }

    context.restore();
}

// ----------------------------------------------------------------------------------

function initialize(){
    // Save game functions
    game_redraw = window.redraw;
    capture_mouse = window.onmousemove;

    // Update game function
    //disableMouse();
    disableDrawing();
    overridePlayButton();

    // Update data
    setNick(bot_name);
    
    // Start the game
    if(autoplay)
        startGame();
}

// ----------------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------------


(function() {
    'use strict';
    
    var interval_id = setInterval(
    function(){
        if ( document.readyState !== 'complete' )
            return;
        
        clearInterval(interval_id);       
        initialize();
    }, 100 );
    

})();
