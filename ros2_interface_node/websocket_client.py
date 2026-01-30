"""
Filename: websocket_client.py
Description: This file implements class for asynchronous websocket client connection.
Author: Daniel Onderka (xonder05)
Date: 01/2026
"""

import asyncio, threading, websockets

class WebsocketClient():

    def __init__(self):
        
        self.server_address = "localhost"
        self.server_port = "9002"

        self.connection = None
        self.listener_task = None
        self.message_callback = lambda msg: print(msg)

        self.event_loop = None
        self.asyncio_thread = None

    #-------------------- Asyncio Lifecycle Functions --------------------

    def start(self):
        """
        Starts asyncio event loop in a thread.
        """
        self.event_loop = asyncio.new_event_loop()
        self.asyncio_thread = threading.Thread(target=self._runner, args=(self.event_loop,), daemon=True)
        self.asyncio_thread.start()


    def _runner(self, event_loop):
        """
        Private function expected to run in a thread. 
        Creates infinite execution loop for asyncio tasks.
        Upon stopping the event loop, calls cleanup and destroys the loop.
        """
        try:
            asyncio.set_event_loop(event_loop)
            event_loop.run_forever()

        finally:
            event_loop.run_until_complete(self._shutdown())
            event_loop.close()


    def stop(self):
        """
        Stops asyncio event loop, and joins its thread.
        """
        # disconnect from server
        if self.connection is not None:
            self.disconnect()
        
        # stop event loop and its thread
        if self.event_loop.is_running():
            self.event_loop.call_soon_threadsafe(self.event_loop.stop)
            self.asyncio_thread.join()
            self.event_loop = None
            self.asyncio_thread = None


    async def _shutdown(self):
        """
        Private asyncio cleanup function. Cancels all running tasks and awaits their completion.
        """

        tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]

        for task in tasks:
            task.cancel()

        await asyncio.gather(*tasks, return_exceptions=True)
        await self.event_loop.shutdown_asyncgens()

    #-------------------- Private WebSocket Async Functions --------------------

    async def _connect(self):
        """
        Connects to websocket server.
        """
        if self.connection is None:
            
            self.connection = await websockets.connect(f"ws://{self.server_address}:{self.server_port}")
    
            self.listener_task = asyncio.create_task(self._message_listener())


    async def _send(self, msg):
        """
        Sends message via websocket. 
        """
        if self.connection is not None:
            await self.connection.send(msg)


    async def _message_listener(self):
        """
        Websocket listener for received messages. In an infinite loop waits for messages and passes them to callback.
        """
        if self.connection is not None:
            async for msg in self.connection:
                self.message_callback(msg)


    async def _disconnect(self):
        """
        Cancels listener task, and closes websocket connection.
        """

        if self.listener_task is not None:
            try:
                self.listener_task.cancel()
                await self.listener_task

            except asyncio.CancelledError:
                pass

            finally:
                self.listener_task = None

        if self.connection is not None:
            
            await self.connection.close(code=1000, reason="shutdown")
            
            self.connection = None

    #-------------------- Public API --------------------

    def connect(self):
        """
        Schedules its private equivalent to run in asyncio thread.    
        """
        asyncio.run_coroutine_threadsafe(coro=self._connect(), loop=self.event_loop)


    def send(self, msg):
        """
        Schedules its private equivalent to run in asyncio thread.    
        """
        asyncio.run_coroutine_threadsafe(coro=self._send(msg), loop=self.event_loop)


    def disconnect(self):
        """
        Schedules its private equivalent to run in asyncio thread.    
        """
        asyncio.run_coroutine_threadsafe(coro=self._disconnect(), loop=self.event_loop)

    #-------------------- Getters and Setters --------------------

    def set_address(self, address: str) -> bool:
        """
        By default 'localhost' is used as address.
        This setter is disabled when connection is established.
        """
        if self.connection is None:
            self.server_address = address


    def set_port(self, port: int) -> bool:
        """
        By default '9002' is used as port.
        This setter is disabled when connection is established.
        """
        if self.connection is None:
            self.server_port = port


    def set_message_callback(self, callback) -> bool:
        """
        By default received messages are printed into console.
        This setter is disabled when connection is established.
        """

        if self.connection is None:
            self.message_callback = callback
