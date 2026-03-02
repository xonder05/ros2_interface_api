"""
Filename: ros2_interface.py
Description: 
    This file implements a ROS2 node. This node handles dynamic creation and destruction of ROS2 communication objects
    as well as bidirectional propagation of messages between ROS2 and WebSocket.
    Configuration commands are received from the WebSocket side.
Author: Daniel Onderka (xonder05)
Date: 01/2026
"""

import json

import rclpy
from rclpy.node import Node
from rosidl_runtime_py import message_to_ordereddict, set_message_fields
from rosidl_runtime_py.utilities import get_message, get_service

import websocket_client

class NodeRedInterface(Node):
    def __init__(self):
        super().__init__("node_red_interface")

        self.declare_parameters(
            namespace="",
            parameters=[
                ("port", rclpy.Parameter.Type.INTEGER),
            ]
        )
        self.port = self.get_parameter("port").get_parameter_value().integer_value

        self.ws_client = websocket_client.WebsocketClient()
        self.ws_client.start()
        self.ws_client.set_port(self.port)
        self.ws_client.set_message_callback(self.message_from_ws_callback)
        self.ws_client.connect()

        # holds data about all registered publishers, subscribers, service clients and servers
        self.config = {}

        self.get_logger().info("InitDone")

# -------------------- Message handlers --------------------

    def message_from_ws_callback(self, msg_string: str) -> None:
        """
        Handles messages received from websocket. Assumes received message object is serialized json.
        Based on 'op' field calls appropriate function. Sends response back to the caller.
        """

        # parse serialized json, format definition can be found in todo
        msg = json.loads(msg_string)
        
        # switch depending on operation
        if msg.get("op") == "publish":
            self.publish(msg.get("topic"), msg.get("payload"))

        if msg.get("op") == "call":
            self.call(msg.get("service"), msg.get("id"), msg.get("payload"))

        elif msg.get("op") == "advertise":
            result = self.advertise(msg.get("topic"), msg.get("type"))

            response = {"op": "advertise", "id": msg.get("id"), "payload": result}
            response_serial = json.dumps(response)
            self.ws_client.send(response_serial)
        
        elif msg.get("op") == "unadvertise":
            result = self.unadvertise(msg.get("topic"))

            response = {"op": "unadvertise", "id": msg.get("id"), "payload": result}
            response_serial = json.dumps(response)
            self.ws_client.send(response_serial)

        elif msg.get("op") == "subscribe":
            result = self.subscribe(msg.get("topic"), msg.get("type"))

            response = {"op": "subscribe", "id": msg.get("id"), "payload": result}
            response_serial = json.dumps(response)
            self.ws_client.send(response_serial)

        elif msg.get("op") == "unsubscribe":
            result = self.unsubscribe(msg.get("topic"))

            response = {"op": "unsubscribe", "id": msg.get("id"), "payload": result}
            response_serial = json.dumps(response)
            self.ws_client.send(response_serial)
        
        elif msg.get("op") == "consume":
            result = self.consume(msg.get("service"), msg.get("type"))

            response = {"op": "consume", "id": msg.get("id"), "payload": result}
            response_serial = json.dumps(response)
            self.ws_client.send(response_serial)

        elif msg.get("op") == "unconsume":
            result = self.unconsume(msg.get("service"))

            response = {"op": "unconsume", "id": msg.get("id"), "payload": result}
            response_serial = json.dumps(response)
            self.ws_client.send(response_serial)

        else:
            self.get_logger().info("WS received message with unknown operation, it will be ignored")


    def message_from_ros_callback(self, topic: str, ros_msg) -> None:
        """
        This is a universal function for forwarding messages from ROS2 subscriber to WebSocket. 
        Uses message_to_ordereddict from rosidl_runtime_py to convert any ROS message to Python dictionary.
        Proper WS protocol header is than constructed and prepended to the dict. The resulting dict is than 
        serialized and sent out.
        """
        ws_msg = {
            "op": "publish", 
            "topic": topic, 
        }
        ws_msg["payload"] = message_to_ordereddict(ros_msg)

        json_msg = json.dumps(ws_msg)
        self.ws_client.send(json_msg)


    def publish(self, topic: str, message: dict) -> None:
        """
        Publishes message to ROS2. Before using this function advertise() for same 'topic' must be called.
        Uses set_message_fields from rosidl_runtime_py to convert Python dictionary to ROS message.
        The message types are imported dynamically during advertise(). Therefore the message is constructed
        using type object retrieved from self.config.
        """
        # check publisher existence
        if self.config.get(topic) is None or self.config.get(topic).get("pub") is None:
            self.get_logger().info(f"Topic {topic} does not have registered publisher")

        else:
            msg = self.config.get(topic).get("pub_type")()
            set_message_fields(msg, message)
            self.config.get(topic).get("pub").publish(msg)


    def call(self, service_name: str, connection_id: str, message: dict) -> None:
        
        # check client existence
        if self.config.get(service_name) is None or self.config.get(service_name).get("cli") is None:
            self.get_logger().info(f"Service {service_name} does not have registered client")

        else:
            # check if there is server that can accept the call
            if not self.config.get(service_name).get("cli").wait_for_service():
                return
            
            # message type from dict, no need for include
            req = self.config.get(service_name).get("cli_type").Request()

            # fill the message object with values from dict            
            set_message_fields(req, message)
            
            # call service()
            future = self.config.get(service_name).get("cli").call_async(req)

            # complete and timeout callback
            timer = self.create_timer(2.0, lambda: self.response(service_name, connection_id, future, timer))
            future.add_done_callback(lambda future: self.response(service_name, connection_id, future, timer))


    def response(self, service_name: str, connection_id: str, response: rclpy.Future, timeout: rclpy.timer):
        
        timeout.cancel()

        if response.done():

            res = response.result()
            msg = message_to_ordereddict(res)

            # wrap received data from ros2 into ws message
            ws_msg = {
                "op": "call", 
                "service": service_name, 
                "id": connection_id, 
                "payload": msg
            }

            # serialize
            json_msg = json.dumps(ws_msg)

            # send to node-red
            self.ws_client.send(json_msg)

        else:
            
            # response message
            ws_msg = {"op": "call", "service": service_name, "id": connection_id, "payload": ""}
            
            # serialize
            json_msg = json.dumps(ws_msg)
            
            # send to node-red
            self.ws_client.send(json_msg)


# -------------------- (Un) Registering ROS2 communication classes --------------------

    def advertise(self, topic: str, full_type_string: str, qos = 10) -> None:
        """
        Registers publisher to specified 'topic'. Saves how many times was this function called 
        and the same amount of unadvertise() calls will be required before unregistering the publisher.
        
        The string passed into the 'type' parameter must be in package/msg/Type format.
        """

        # init in case this topic is new
        if self.config.get(topic) is None:
            self.config[topic] = {}

        # not yet registered
        if self.config.get(topic).get("pub_cnt") is None:
            try:
                # import type
                package_name, type_name = full_type_string.split("/")
                type_class = get_message(f"{package_name}/{type_name}")

                # create publisher and config
                self.config[topic]["pub"] = self.create_publisher(type_class, topic, qos)
                self.config[topic]["pub_cnt"] = 1
                self.config[topic]["pub_type"] = type_class

                self.get_logger().info(f"Publisher for topic {topic} successfully registered")
            
            # all of these can be thrown by the get_message function
            except ValueError:
                self.get_logger().info(f"The 'full_type_string' parameter is not in correct format, expected: 'package/Type', got: '{full_type_string}'")
                return False
            
            except ModuleNotFoundError:
                self.get_logger().info(f"Package {package_name} does not exist")
                return False
            
            except AttributeError:
                self.get_logger().info(f"Package {package_name} does not contain {type_name} type")
                return False

        # already registered, just increment counter
        else:
            self.get_logger().info(f"There is already registered publisher on topic {topic}")
            self.config[topic]["pub_cnt"] += 1

        return True


    def unadvertise(self, topic: str) -> None:
        """
        Reverse function to advertise. Note that the actual unregistering of publisher happens only
        after this function is called the same amount of times as advertise().
        """

        # none registered
        if self.config.get(topic) is None or self.config.get(topic).get("pub_cnt") is None:
            self.get_logger().info(f"Cannot remove publisher for topic {topic}, because it does not exist")
        
        # one or more registered
        else:
            # more than one, lower counter
            if self.config.get(topic).get("pub_cnt") > 1:
                self.config[topic]["pub_cnt"] -= 1
            
            # last one, delete publisher and cleanup
            else:
                self.destroy_publisher(self.config[topic]["pub"])

                del self.config[topic]["pub"]
                del self.config[topic]["pub_cnt"]
                del self.config[topic]["pub_type"]

                if len(self.config[topic]) == 0:
                    del self.config[topic]
                
                self.get_logger().info(f"Successfully removed publisher from topic {topic}")
        
        return True


    def subscribe(self, topic_name: str, full_type_string: str, qos = 10) -> None:
        """
        Registers subscriber to specified 'topic'. Saves how many times was this function called 
        and the same amount of unsubscribe() calls will be required before unregistering the subscriber.
        
        The string passed into the 'type' parameter must be in package/msg/Type format.
        """

        # init in case this topic is new
        if self.config.get(topic_name) is None:
            self.config[topic_name] = {}
        
        # not yet registered
        if self.config.get(topic_name).get("sub_cnt") is None:
            try:
                # import type
                package_name, type_name = full_type_string.split("/")
                type_class = get_message(f"{package_name}/{type_name}")

                # create subscriber and config
                self.config[topic_name]["sub"] = self.create_subscription(type_class, topic_name, qos_profile=qos,
                    callback=lambda msg, topic=topic_name : self.message_from_ros_callback(topic, msg)
                )
                self.config[topic_name]["sub_cnt"] = 1
                self.get_logger().info(f"Subscriber for topic {topic_name} successfully register")

            # all of these can be thrown by the get_message function
            except ValueError:
                self.get_logger().info(f"The 'full_type_string' parameter is not in correct format, expected: 'package/Type', got: '{full_type_string}'")
                return False
            
            except ModuleNotFoundError:
                self.get_logger().info(f"Package {package_name} does not exist")
                return False
            
            except AttributeError:
                self.get_logger().info(f"Package {package_name} does not contain {type_name} type")
                return False
            
        # already registered, just increment counter
        else:
            self.get_logger().info(f"There is already registered subscriber on topic {topic_name}")
            self.config[topic_name]["sub_cnt"] += 1

        return True


    def unsubscribe(self, topic: str) -> None:
        """
        Reverse function to subscribe. Note that the actual unregistering of subscriber happens only
        after this function is called the same amount of times as subscribe().
        """

        # none registered
        if self.config.get(topic) is None or self.config.get(topic).get("sub_cnt") is None:
            self.get_logger().info(f"Cannot remove subscriber for topic {topic}, because it does not exist")
            
        # one or more registered      
        else:
            # more than one, lower counter
            if self.config.get(topic).get("sub_cnt") > 1:
                self.config[topic]["sub_cnt"] -= 1
            
            # last one, delete subscriber and cleanup
            else:
                self.destroy_subscription(self.config[topic]["sub"])

                del self.config[topic]["sub"]
                del self.config[topic]["sub_cnt"]

                if len(self.config[topic]) == 0:
                    del self.config[topic]

                self.get_logger().info(f"Successfully removed subscriber from topic {topic}")

        return True


    def consume(self, service_name: str, full_type_string: str, qos = 10) -> None:
        """
        Registers client on service with specific 'name'. Saves how many times was this function called 
        and the same amount of unconsume() calls will be required before unregistering the client.
        
        The string passed into the 'full_type' parameter must be in package/srv/Type format.
        """

        # init in case this topic is new
        if self.config.get(service_name) is None:
            self.config[service_name] = {}
        
        # not yet registered
        if self.config.get(service_name).get("cli_cnt") is None:
            try:
                # import type
                package_name, type_name = full_type_string.split("/")
                type_class = get_service(f"{package_name}/{type_name}")      

                # create subscriber and config
                self.config[service_name]["cli"] = self.create_client(type_class, service_name)
                self.config[service_name]["cli_cnt"] = 1
                self.config[service_name]["cli_type"] = type_class
                
                self.get_logger().info(f"Client for service {service_name} successfully register")

            # all of these can be thrown by the get_message function
            except ValueError:
                self.get_logger().info(f"The 'full_type_string' parameter is not in correct format, expected: 'package/Type', got: '{full_type_string}'")
                return False
            
            except ModuleNotFoundError:
                self.get_logger().info(f"Package {package_name} does not exist")
                return False
            
            except AttributeError:
                self.get_logger().info(f"Package {package_name} does not contain {type_name} type")
                return False

        # already registered, just increment counter
        else:
            self.get_logger().info(f"There is already registered client on service {service_name}")
            self.config[service_name]["cli_cnt"] += 1

        return True


    def unconsume(self, service_name: str) -> None:
        """
        Reverse function to consume. Note that the actual unregistering of client happens only
        after this function is called the same amount of times as consume().
        """

        # none registered
        if self.config.get(service_name) is None or self.config.get(service_name).get("cli_cnt") is None:
            self.get_logger().info(f"Cannot remove client for service {service_name}, because it does not exist")
            
        # one or more registered      
        else:
            # more than one, lower counter
            if self.config.get(service_name).get("cli_cnt") > 1:
                self.config[service_name]["cli_cnt"] -= 1
            
            # last one, delete subscriber and cleanup
            else:
                self.destroy_client(self.config[service_name]["cli"])

                del self.config[service_name]["cli"]
                del self.config[service_name]["cli_cnt"]
                del self.config[service_name]["cli_type"]

                if len(self.config[service_name]) == 0:
                    del self.config[service_name]

                self.get_logger().info(f"Successfully removed client from service {service_name}")

        return True

# -------------------- Main --------------------

def main(args=None):
    rclpy.init(args=args)
    node = NodeRedInterface()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
