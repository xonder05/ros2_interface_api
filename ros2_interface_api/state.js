/**
 * @file state.js
 * @brief Implements class for holding a system state. Provides both direct getter / setter and EventEmitter callbacks.
 * 
 * @author Daniel Onderka (xonder05)
 * @date 01/2026
 */

"use strict";

const events = require('events');

class State extends events.EventEmitter
{
    current_state = undefined;

    /**
     * @returns Current state 
     */
    get() 
    {
        if (this.current_state) 
        {
            return this.current_state;
        }
    }

    /**
     * @param {string} state New state
     */
    set(state) 
    {
        if (this.current_state != state)
        {
            this.current_state = state;
            
            super.emit("", this.current_state);
            super.emit(this.current_state);
        }
    }

    /**
     * Triggers on any state change.
     * @param {Function} listener 
     */
    on(listener) 
    {
        return super.on("", listener);
    }

    off(listener) 
    {
        return super.off("", listener);
    }

    /**
     * Triggers when system enters specific state
     * @param {string} state 
     * @param {Function} listener 
     */
    once_state(state, listener)
    {
        return super.once(state, listener);
    }
}

module.exports = State;
