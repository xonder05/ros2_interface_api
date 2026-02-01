#!/usr/bin/env node

/**
 * @file ros2_node_launcher.js
 * @brief Handles starting and stopping the ros2_interface. 
 * 
 * ros2_interface is a ROS2 node that is not installed as part of any package
 * it can be started like any other python script
 * this allows to start the interface from within node-red
 * 
 * @author Daniel Onderka (xonder05)
 * @date 01/2026
 */

"use strict";

const path = require("path");
const child_process = require("child_process");
const logger = require("./logger.js");

let print_prefix = "[Launcher]";

let child_handle = undefined;
let sigterm_timeout = undefined;
let sigkill_timeout = undefined;

const STATE = Object.freeze({
  OFFLINE: 0,
  ONLINE: 1,
});

let CURRENT_STATE = STATE.OFFLINE;

/**
 * Spawns new instance of the ros2
 */
function launch(port)
{
    if (CURRENT_STATE == STATE.ONLINE) {
        logger.warn(print_prefix, "Could not start ROS2 interface node because it is already running");
    }

    child_handle = child_process.spawn(
        "python3", 
        [
            path.join(__dirname, "..", "ros2_interface_node", "ros2_interface.py"),
            "--ros-args", "-p", `port:=${port}`
        ],
        { stdio: "inherit" }
    );

    for (const [event, handler] of Object.entries(instance_events)) 
    {
        child_handle.once(event, handler);
    }

    logger.info(print_prefix, "ROS2 interface successfully launched");
    CURRENT_STATE = STATE.ONLINE;
}

/**
 * child_handle.on() callback functions
 */
const instance_events = {

    error: (err) => {
        logger.error(print_prefix, `There was an error when launching ROS2 interface node: ${err.code}`);
        CURRENT_STATE = STATE.OFFLINE;
    },

    exit: (code, signal) => 
    {
        if (signal) {
            logger.warn(print_prefix, `ROS2 interface node killed by ${signal} signal`);
        }

        if (code) {
            logger.warn(print_prefix, `ROS2 interface node exited (return code: ${code})`);
        }

        CURRENT_STATE = STATE.OFFLINE;

        if (sigterm_timeout != undefined) {
            sigterm_timeout.cancel()
        }

        if (sigkill_timeout != undefined) {
            sigkill_timeout.cancel()
        }
    }
}

/**
 * Sends increasingly strong exit signals to ros2_interface.
 */
function stop()
{
    if (CURRENT_STATE == STATE.OFFLINE) {
        logger.warn(print_prefix, "Cannot stop ROS2 interface node because it is not running");
    }

    logger.info(print_prefix, "Interrupting ros2_interface [SIGINT]");
    child_handle.kill("SIGINT")

    setTimeout(() => {
        logger.info(print_prefix, "Terminating ros2_interface [SIGTERM]");
        child_handle.kill("SIGTERM")
        
    }, 500);

    setTimeout(() => {
        logger.info(print_prefix, "Killing ros2_interface [SIGKILL]");
        child_handle.kill("SIGKILL")
    }, 1000);
}

/**
 * Kills ros2_interface on application exit (prevents zombie instances)
 */
process.on("exit", (code) => 
{
    if (CURRENT_STATE == STATE.ONLINE)
    {
        logger.info(print_prefix, `Application shut down, stopping ROS2 interface`)
        stop();
    }
});

module.exports = {
    
    launch: launch,
    stop: stop,

    STATE: STATE,
    get_current_state: () => {
        return CURRENT_STATE;
    }
}
