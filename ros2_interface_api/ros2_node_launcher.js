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

// -------------------- Imports --------------------

const Logger = require("./logger.js");
const State = require("./state.js");

const path = require("path");
const child_process = require("child_process");

// -------------------- Init and Properties --------------------

const logger = new Logger();
logger.prefix = "[JavaScript Subprocess Handler]";
const state = new State();
state.set("stopped");

let child_handle = undefined;
let sigterm_timeout = undefined;
let sigkill_timeout = undefined;

// -------------------- Subprocess Public API --------------------

function launch(port)
{
    if (state.get() == "stopped") 
    {
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

        logger.info("Created ROS2 interface node");
        state.set("running");
    }
    else if (state.get() == "running")
    {
        logger.warn("ROS2 interface node is already running, this call will be ignored");
    }
    else
    {
        logger.error("Unexpected call to launch, launcher in inconsistent state, transitioning to error");
        state.set("err");
    }
}

function stop()
{
    if (state.get() == "running")
    {
        logger.info("Interrupting ROS2 interface node [SIGINT]");
        child_handle.kill("SIGINT");

        sigterm_timeout = setTimeout(() => 
        {
            logger.info("Terminating ROS2 interface node [SIGTERM]");
            child_handle.kill("SIGTERM");
            
        }, 500);

        sigkill_timeout = setTimeout(() => 
        {
            logger.info("Killing ROS2 interface node [SIGKILL]");
            child_handle.kill("SIGKILL");

        }, 1000);

        state.set("stopping");
    }
    else if (state.get() == "stopped")
    {
        logger.warn("ROS2 interface node is already stopped, this call will be ignored");
    }
    else
    {
        logger.error("Unexpected call to stop, launcher in inconsistent state, transitioning to error");
        state.set("err");
    }
}

// -------------------- Subprocess Events --------------------

const instance_events = {

    error: (err) => 
    {
        logger.error(`The following error occurred when trying to launch ROS2 interface node: ${err.code}`);
        logger.error("Transitioning to error state");
        state.set("err");
    },

    exit: (code, signal) => 
    {
        if (state.get() == "stopping")
        {
            if (code) {
                logger.error(`ROS2 interface node exited (return code: ${code})`);
                logger.error(`At this point the node should have been killed by signal, transitioning to error`);
                state.set("err");
            }

            if (signal) {
                logger.info(`ROS2 interface node successfully killed by ${signal} signal`);
                state.set("stopped");
            }

            // cleanup
            if (sigterm_timeout != undefined) {
                clearTimeout(sigterm_timeout)
                sigterm_timeout = undefined;
            }

            if (sigkill_timeout != undefined) {
                clearTimeout(sigkill_timeout)
                sigkill_timeout = undefined;
            }
        }
        else if (state.get() == "running")
        {
            if (code) {
                logger.warn(`ROS2 interface node exited (return code: ${code})`);
                state.set("err");
            }

            if (signal) {
                logger.warn(`ROS2 interface node killed by ${signal} signal`);
                state.set("err");
            }
        }
        else
        {
            logger.error("Unexpected call to exit, launcher in inconsistent state, transitioning to error");
            state.set("err");
        }
    }
}

process.on("exit", (code) => 
{
    if (state.get() == "running")
    {
        logger.info("Application shut down, stopping ROS2 interface")
        stop();
    }
});

// -------------------- Exports --------------------

module.exports = {
    state,
    launch,
    stop,
}
