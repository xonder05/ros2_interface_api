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

const Logger = require("./logger.js");
const State = require("./state.js");

const http = require("http");
const WebSocketServer = require('websocket').server;

// -------------------- Init and Properties --------------------

const logger = new Logger();
logger.prefix = "[JavaScript WebSocket Server]";
const state = new State();
state.set("offline");

let http_server = undefined;
let ws_server = undefined;
let connection = undefined;
let message_callback = undefined;
let closing = false;

// -------------------- Websocket Public API --------------------

function start(port)
{
    if (state.get() == "offline")
    {
        http_server = http.createServer();
        http_server.on("error", http_events.error);
        http_server.on("request", http_events.request);
        http_server.on("close", http_events.close);
        http_server.listen(port, "localhost", http_events.listen);

        ws_server = new WebSocketServer({
            httpServer: http_server,
            closeTimeout: 1000,
            tlsOptions: {
                    rejectUnauthorized: false
            }
        });
        ws_server.on("request", ws_events.request);
    }
    else
    {
        logger.warn("Server is already running");
        state.set("error");
    }
}

function stop()
{
    closing = true;

    if (state.get() == "connected")
    {
        if (connection && connection.connected)
        {
            connection.close(1000, "Normal Closure");
            state.set("closing");
        }
    }
    else if (state.get() == "waiting")
    {
        http_server.close();
        state.set("stopping");
    }
    else
    {
        logger.error("Websocket stopping error");
        state.set("error");
    }
}

function send_message(msg) 
{
    if (connection && connection.connected) 
    {
        logger.info(`Sending message ${msg}`);
        connection.send(msg);
        return true;
    }
    else
    {
        logger.info("Connection object invalid");
        return false;
    }
}

// -------------------- Event handlers --------------------

const http_events = {

    listen: (port) =>
    {
        logger.info(`HTTP server successfully statred on: localhost:${port}`);
        state.set("waiting");
    },

    error: (err) => 
    {
        logger.error(`HTTP server failed with error: ${err}"`);
        state.set("error");
    },

    request: (req, res) => 
    {
        res.writeHead(404, {"Content-Type": "text/plain"});
        res.end("This server accepts only WebSocket connections.");
    },

    close: () =>
    {
        logger.info("HTTP server closed");
        state.set("offline");

        if (closing) {
            closing = false;
        }
    },
}

const ws_events = {

    request: (request) => 
    {
        if (connection == undefined)
        {
            connection = request.accept(null, request.origin);

            for (const [event, handler] of Object.entries(connection_events)) 
            {
                connection.on(event, handler);
            }

            logger.info("Websocket connection request accepted.");
            state.set("connected")
        }
        else
        {
            request.reject()
            logger.warn("Server received second connection request, this client will be ignored");
        }
    },
}

const connection_events = {

    message: (msg) =>
    {
        if (msg.type == "utf8" && typeof msg.utf8Data == "string") 
        {
            try {
                const msg_json = JSON.parse(msg.utf8Data);

                logger.info(`Message received: '${msg.utf8Data}'`);
                message_callback(msg_json);
            }
            catch(err) {
                logger.warn("Message received, cannot parse json, will be ignored");
                logger.warn(err);
            }
        }
        else
        {
            logger.warn("Message received, unsupported format, will be ignored");
        }
    },

    error: (error) =>
    {
        logger.error(`Connection Error: ${error.toString()}`);
        state.set("error");
    },

    close: (code, reason) =>
    {
        logger.warn(`Connection Closed [${code}]:`, reason);
        state.set("waiting");

        if (closing) {
            stop();
        }
    },
}

// -------------------- Exports --------------------

module.exports = {
    state,
    start,
    stop,
    send_message,

    set_message_callback(callback) {
        message_callback = callback;
    }
}
