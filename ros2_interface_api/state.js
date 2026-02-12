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
            
            super.emit("change", this.current_state);
            super.emit(this.current_state);
        }
    }

    on(state, listener)
    {
        if (listener) {
            listener(this.current_state);
        }

        super.on(state, listener)
    }
}

module.exports = State;
