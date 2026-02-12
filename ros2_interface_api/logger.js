/**
 * @file logger.js
 * @brief Simple logger class. Logs have same structure as ROS2 logger.
 * 
 * @author Daniel Onderka (xonder05)
 * @date 02/2026
 */

"use strict";

const colors = require("colors");

class Logger
{
    prefix = "";

    error(...message)
    {
        console.log(colors.red("[ERROR]"), `[${Date.now()}]`, this.prefix, ...message);
    }

    warn(...message)
    {
        console.log(colors.yellow("[WARNING]"), `[${Date.now()}]`, this.prefix, ...message);
    }

    info(...message) 
    {
        console.log(colors.green("[INFO]"), `[${Date.now()}]`, this.prefix, ...message);
    }

    debug(...message) 
    {
        console.log(colors.blue("[DEBUG]"), `[${Date.now()}]`, this.prefix, ...message);
    }
}

module.exports = Logger;
