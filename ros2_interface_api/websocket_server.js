#!/usr/bin/env node

/**
 * @file websocket_server.js
 * @brief 
 * 
 * @author Daniel Onderka (xonder05)
 * @date 01/2026
 */

// -------------------- Imports --------------------
"use strict";

const http = require("http")
const WebSocketServer = require('websocket').server;

const logger = require('./logger.js');
const print_prefix = "[WebSocket]";

const STATE = Object.freeze({
  OFFLINE: 0,
  ONLINE: 1,
  CONNECTION: 2,
});

// -------------------- Init and Properties --------------------

let ws_server = undefined;
let http_server = undefined;
let connection = undefined;
let message_callback = undefined;
let CURRENT_STATE = STATE.OFFLINE;

// -------------------- Websocket Functions --------------------

/**
 * Create simple http server. Required for first connection before upgrading to WebSocket
 */
function create_http_server(port)
{
    http_server = http.createServer((req, res) => {
        res.writeHead(404, {"Content-Type": "text/plain"});
        res.end("This server accepts only WebSocket connections.")
    });

    http_server.on("error", (err) => {
        throw Error("HTTP server error event");
    });

    http_server.listen(port, "localhost", () => {
        logger.info(print_prefix, `HTTP server started on localhost:${port}`);
    });
}

/**
 * Create websocket server on top of existing http one.
 */
function create_websocket_server()
{
    ws_server = new WebSocketServer({
        httpServer: http_server,
        tlsOptions: {
                rejectUnauthorized: false
        }
    });

    logger.info(print_prefix, "Websocket server started");
    CURRENT_STATE = STATE.ONLINE;

    /**
     * Connection request event handler. Accepts one connection, if any more attempts are made they are rejected.
     * This module is intended to communicate with single client.
     */
    ws_server.on("request", (request) => 
    {
        if (connection == undefined)
        {
            connection = request.accept(null, request.origin);

            logger.info(print_prefix, "Websocket connection request accepted.");
            CURRENT_STATE = STATE.CONNECTION;

            for (const [event, handler] of Object.entries(connection_events)) 
            {
                connection.on(event, handler);
            }
        }
        else
        {
            request.reject()
            logger.info(print_prefix, "Websocket connection request rejected because there is already existing connection.");
        }
        
    });

    ws_server.on("error", (err) => {
        throw Error("WebSocket error event")
    });
}

const connection_events = {

    /**
     * Validates that received message is string, deserializes json into object and calls higher level callback.
     */
    message: (msg) =>
    {
        if (msg.type !== 'utf8' && typeof msg.utf8Data !== "string") 
        {
            logger.warn(print_prefix, "Received message, but is not in supported format");
        }
        else
        {
            let msg_json
            try {
                msg_json = JSON.parse(msg.utf8Data);
            }
            catch(err) {
                logger.warn(print_prefix, "Received message, but it cannot be deserialized because it is not a valid json");
            }

            logger.info(print_prefix, `Message Received: '${msg.utf8Data}'`);

            message_callback(msg_json);
        }
    },

    /**
     * Close when connection closes gracefully
     */
    close: (code, reason) =>
    {
        logger.warn(print_prefix, `Connection Closed [${code}]:`, reason);
        CURRENT_STATE = STATE.CLOSED;
    },

    /**
     * Error when connection closes unexpectedly
     */
    error: (error) =>
    {
        logger.error(print_prefix, `Connection Error: ${error.toString()}`);
        CURRENT_STATE = STATE.CLOSED;
    }
}

/**
 *  Starts the websocket server. Consists of creating http and websocket servers, along with their callbacks.
 */
function launch(port)
{
    create_http_server(port);
    create_websocket_server();
}

/**
 * Stops http server.
 */
function destroy_http_server()
{
    http_server.close(() => {
        logger.info(print_prefix, `HTTP server closed`)
    })
}

/**
 * Drops connection to client.
 */
function destroy_websocket_server()
{
    connection.drop(1000, "Normal Closure");
}

/**
 * Stops websocket server, reverse function to launch()
 */
function stop()
{
    destroy_websocket_server();
    destroy_http_server();
}

/**
 *
 */
function send_message(msg) 
{
    logger.info(print_prefix, `Sending message ${msg}`);

    if (connection && connection.connected) {
        connection.send(msg);
    }
}

module.exports = {

    set_message_callback: (func) => {
        message_callback = func;
    },

    send_message,

    launch: launch,
    stop: stop,

    STATE: STATE,
    get_current_state: () => {
        return CURRENT_STATE;
    },

    get_websocket_port: () => {
        return port;
    },
}
