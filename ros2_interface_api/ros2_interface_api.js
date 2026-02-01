/**
 * @file ros2_interface_api.js
 * @brief 
 * 
 * @author Daniel Onderka (xonder05)
 * @date 01/2026
 */

// -------------------- Imports --------------------
"use strict";

const events = require('events');

const ws = require('./websocket_server.js');
const launcher = require('./ros2_node_launcher.js')
const logger = require('./logger.js');
let print_prefix = "[]";

// -------------------- Init and Properties --------------------

ws.set_message_callback(message_callback);

let message_event_emitter = new events.EventEmitter();
let message_queue = [];

// -------------------- Lifecycle Functions --------------------

/**
 * Starts up ros2_interface and websocket server
 * Make sure to use try-catch, since this throws Error() when something goes wrong.
 */
function launch()
{
    const port = Math.floor(Math.random() * 16383 + 49152);

    launcher.launch(port);
    ws.launch(port);
}

/**
 * Drops websocket connection and stops ros2_interface
 * Make sure to use try-catch, since this throws Error() when something goes wrong.
 */
function stop()
{
    ws.stop();
    launcher.stop()
};

/**
 * Checks if ros2_interface is stared and websocket connection with it is established.
 */
function interface_ready()
{
    if (launcher.get_current_state() == launcher.STATE.ONLINE && ws.get_current_state() == ws.STATE.CONNECTION) {
        return true;
    }
    else {
        return false;
    }
}

// -------------------- Outgoing Message Construction --------------------

/**
 * Request from ros2_interface the ability to publish messages of 'type' on 'topic'.
 * Constructs JSON message according to protocol and sends it to ros2_interface. 
 */
function advertise_topic(topic_name, type, qos) 
{
    const msg = '{"op":"advertise","topic":"' + String(topic_name) + '","type":"' + String(type) + '"}';

    if (interface_ready()) 
    {
        ws.send_message(msg);
    }
    else 
    {
        message_queue.push(msg);

        if (message_queue.length == 1) {
            send_once_ready();
        }
    }}

/**
 * Inform the ros2_interface that no more messages of 'type' will be sent to 'topic'.
 * Constructs JSON message according to protocol and sends it to ros2_interface. 
 */
function unadvertise_topic(topic_name) 
{
    const msg = '{"op":"unadvertise","topic":"' + String(topic_name) + '"}';

    if (interface_ready()) 
    {
        ws.send_message(msg);
    }
    else 
    {
        message_queue.push(msg);

        if (message_queue.length == 1) {
            send_once_ready();
        }
    }
}

/**
 * Inform ros2_interface that you want to receive messages from 'topic' in 'type' format.
 * Constructs JSON message according to protocol and sends it to ros2_interface. 
 */
function subscribe_topic(topic_name, type, qos) 
{
    const msg = '{"op":"subscribe","topic":"' + String(topic_name) + '","type":"' + String(type) + '"}';

    if (interface_ready()) 
    {
        ws.send_message(msg);
    }
    else 
    {
        message_queue.push(msg);

        if (message_queue.length == 1) {
            send_once_ready();
        }
    }
}

/**
 * Inform ros2_interface that you no longer want to receive messages from 'topic' in 'type' format.
 * Constructs JSON message according to protocol and sends it to ros2_interface. 
 */
function unsubscribe_topic(topic_name) 
{
    const msg = '{"op":"unsubscribe","topic":"' + String(topic_name) + '"}';

    if (interface_ready()) 
    {
        ws.send_message(msg);
    }
    else 
    {
        message_queue.push(msg);

        if (message_queue.length == 1) {
            send_once_ready();
        }
    }
}

/**
 * Publishes data via websocket to previously registered topic
 */
async function publish(topic_name, data)
{
    let msg = '{"op":"publish","topic":"' + String(topic_name) + '","msg":' + JSON.stringify(data) + '}';

    if (interface_ready()) 
    {
        ws.send_message(msg);
    }
    else 
    {
        message_queue.push(msg);

        if (message_queue.length == 1) {
            send_once_ready();
        }
    }
}

/**
 * Waits until interface is ready, and than sends all queued messages.
 */
function send_once_ready()
{
    if (interface_ready())
    {
        for (msg in message_queue)
        {
            ws.send_message(msg)
        }
        message_queue = [];
    }
    else
    {
        setTimeout(() => {
            send_once_ready()
        }, 500);
    }
}

// -------------------- Incoming Message Handling --------------------

/**
 * 
 */
function message_callback(msg)
{
    if (msg.op == "publish")
    {
        message_event_emitter.emit(msg.topic, msg);
    }
}

// -------------------- Getters and Setters --------------------

function get_event_emitter()
{
    return message_event_emitter;
}

function get_system_status()
{
    return {is_instance: launcher.get_current_state(), ws_connection: ws.get_current_state()}
}

// -------------------- Exports Public API --------------------

module.exports = {
    launch,
    stop,

    advertise_topic,
    unadvertise_topic,
    subscribe_topic,
    unsubscribe_topic,
    publish,

    get_event_emitter,
    get_system_status,
};