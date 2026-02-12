/**
 * @file ros2_interface_api.js
 * @brief 
 * 
 * @author Daniel Onderka (xonder05)
 * @date 01/2026
 */

// -------------------- Imports --------------------
"use strict";

const Logger = require("./logger.js");
const State = require("./state.js");
const launcher = require('./ros2_node_launcher.js')
const ws = require('./websocket_server.js');

const events = require('events');

// -------------------- Init and Properties --------------------

const logger = new Logger();
logger.prefix = "[JS Subprocess]";

ws.set_message_callback(message_callback);

let message_event_emitter = new events.EventEmitter();
let message_queue = [];
let pending_requests = {};

// -------------------- Derive top level state from subsystems --------------------

const state = new State();
state.set("inactive");

launcher.state.on((launcher_state) => 
{
    if (launcher_state == "running" && ws.state.get() == "connected") {
        state.set("active");
    }
    else {
        state.set("inactive");
    }
})

ws.state.on((ws_state) => 
{
    if (ws_state == "connected" && launcher.state.get() == "running") {
        state.set("active");
    }
    else {
        state.set("inactive");
    }
})

// -------------------- Public API --------------------

function launch()
{
    const port = Math.floor(Math.random() * 16383 + 49152);

    launcher.launch(port);
    ws.start(port);
}

function stop()
{
    ws.stop();
    launcher.stop()
};

// -------------------- Outgoing Message Construction --------------------

function create_deferred_promise()
{
    let resolve, reject;
    const promise = new Promise((res, rej) => {resolve = res; reject = rej;});
    return {promise, resolve, reject}
}

/**
 * Request from ros2_interface the ability to publish messages of 'type' on 'topic'.
 * Constructs JSON message according to protocol and sends it to ros2_interface. 
 */
async function advertise_topic(request_id, topic_name, full_type_name, qos) 
{
    if (state.get() == "active")
    {
        const msg = {
            id: request_id,
            op: "advertise",
            topic: String(topic_name),
            type: String(full_type_name)
        }
        const serialized_msg = JSON.stringify(msg);
    
        if (ws.send_message(serialized_msg))
        {
            const promise = create_deferred_promise();
            
            const pub = Object.freeze({
                topic_name,
                full_type_name,
                destroy: async function (request_id) {
                    await unadvertise_topic(request_id, this.topic_name)
                }
            })

            pending_requests[request_id] = {
                promise,
                pub,
            };

            return promise.promise;
        }
    }

    throw new Error("Could not send message");
}

/**
 * Inform the ros2_interface that no more messages of 'type' will be sent to 'topic'.
 * Constructs JSON message according to protocol and sends it to ros2_interface. 
 */
function unadvertise_topic(request_id, topic_name) 
{
    if (state.get() == "active")
    {
        const msg = {
            id: request_id,
            op: "unadvertise",
            topic: String(topic_name),
        }
        const serialized_msg = JSON.stringify(msg);
 
        if (ws.send_message(serialized_msg))
        {
            const promise = create_deferred_promise();
            pending_requests[request_id] = promise;
            return promise.promise;
        }
    }

    throw new Error("Could not send message");
}

/**
 * Inform ros2_interface that you want to receive messages from 'topic' in 'type' format.
 * Constructs JSON message according to protocol and sends it to ros2_interface. 
 */
function subscribe_topic(request_id, topic_name, full_type_name, message_callback, qos) 
{
    if (state.get() == "active")
    {
        const msg = {
            id: request_id,
            op: "subscribe",
            topic: String(topic_name),
            type: String(full_type_name)
        }
        const serialized_msg = JSON.stringify(msg);

        if (ws.send_message(serialized_msg))
        {
            const promise = create_deferred_promise();
            
            const sub = Object.freeze({
                topic_name,
                full_type_name,
                message_callback,
                destroy: async function (request_id) {
                    await unsubscribe_topic(request_id, this.topic_name, this.message_callback)
                }
            })

            pending_requests[request_id] = {
                promise,
                sub,
            };

            return promise.promise;
        }
    }

    throw new Error("Could not send message");
}

/**
 * Inform ros2_interface that you no longer want to receive messages from 'topic' in 'type' format.
 * Constructs JSON message according to protocol and sends it to ros2_interface. 
 */
function unsubscribe_topic(request_id, topic_name, message_callback) 
{
    if (state.get() == "active")
    {
        const msg = {
            id: request_id,
            op: "unsubscribe",
            topic: String(topic_name),
        }
        const serialized_msg = JSON.stringify(msg);

        if (ws.send_message(serialized_msg))
        {
            message_event_emitter.off(topic_name, message_callback);

            const promise = create_deferred_promise();
            pending_requests[request_id] = promise;
            return promise.promise;
        }
    }

    throw new Error("Could not send message");

}

function consume_service(request_id, service_name, full_type_name, qos) 
{
    if (state.get() == "active")
    {
        const msg = {
            id: request_id,
            op: "consume",
            service: String(service_name),
            type: String(full_type_name)
        }
        const serialized_msg = JSON.stringify(msg);
    
        if (ws.send_message(serialized_msg))
        {
            const promise = create_deferred_promise();
            
            const cli = Object.freeze({
                service_name,
                full_type_name,
                destroy: async function (request_id) {
                    await unconsume_service(request_id, this.service_name)
                }
            })

            pending_requests[request_id] = {
                promise,
                cli,
            };

            return promise.promise;
        }
    }

    throw new Error("Could not send message");
}

function unconsume_service(request_id, service_name) 
{
    if (state.get() == "active")
    {
        const msg = {
            id: request_id,
            op: "unconsume",
            service: String(service_name),
        }
        const serialized_msg = JSON.stringify(msg);

        if (ws.send_message(serialized_msg))
        {
            const promise = create_deferred_promise();
            pending_requests[request_id] = promise;
            return promise.promise;
        }
    }

    throw new Error("Could not send message");
}

/**
 * Publishes data via websocket to previously registered topic
 */
function publish(topic_name, payload)
{
    if (state.get() == "active")
    {
        const msg = {
            op: "publish",
            topic: String(topic_name),
            payload: payload
        }
        const serialized_msg = JSON.stringify(msg);

        if (ws.send_message(serialized_msg))
        {
            return;
        }
    }

    throw new Error("Could not send message");
}

async function call(request_id, service_name, payload)
{
    if (state.get() == "active")
    {
        const msg = {
            id: request_id,
            op: "call",
            service: String(service_name),
            payload: payload
        }
        const serialized_msg = JSON.stringify(msg);

        if (ws.send_message(serialized_msg))
        {
            const promise = create_deferred_promise();
            pending_requests[request_id] = promise;
            return promise.promise;
        }
    }

    throw new Error("Could not send message");
}

// -------------------- Incoming Message Handling --------------------

function message_callback(msg)
{
    if (msg.op == "advertise" ||
        msg.op == "consume")
    {
        const { promise, obj } = pending_requests[msg.id];

        if (msg.payload) {
            promise.resolve(obj)
        }
        else {
            promise.reject()
        }

        delete pending_requests[msg.request_id]
    }
    else if (msg.op == "unadvertise" ||
             msg.op == "unsubscribe" ||
             msg.op == "unconsume")
    {
        const promise = pending_requests[msg.id];

        if (msg.payload) {
            promise.resolve()
        }
        else {
            promise.reject()
        }

        delete pending_requests[msg.request_id]
    }
    else if (msg.op == "subscribe")
    {
        const { promise, sub } = pending_requests[msg.id];

        if (msg.payload) 
        {
            message_event_emitter.on(sub.topic_name, sub.message_callback);
            promise.resolve(sub)
        }
        else {
            promise.reject()
        }

        delete pending_requests[msg.request_id]
    }
    else if (msg.op == "call")
    {
        const promise = pending_requests[msg.id];

        if (msg.payload !== "") {
            promise.resolve(msg.payload)
        }
        else {
            promise.reject()
        }

        delete pending_requests[msg.request_id]
    }
    else if (msg.op == "publish")
    {
        message_event_emitter.emit(msg.topic, msg);
    }
    else
    {
        logger.warn("Unknown Operation");
    }
}

// -------------------- Exports Public API --------------------

module.exports = {
    state,
    launch,
    stop,

    advertise_topic,
    subscribe_topic,
    consume_service,
    publish,
    call,
};
