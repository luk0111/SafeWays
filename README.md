# SafeWays

SafeWays is a high-performance traffic management and road safety solution designed to prevent collisions in high-risk urban scenarios. By leveraging **Artificial Intelligence** and **V2X (Vehicle-to-Everything) communication**, the system models vehicles as autonomous agents that cooperate in real-time to mitigate accidents, especially in intersections with obstructed visibility.

## Project Overview

In modern urban environments, many accidents occur due to blind spots, physical obstructions (such as heavy vehicles or infrastructure), and the limited range of individual onboard sensors. SafeWays addresses these challenges by moving beyond isolated vehicle perception. 

The system creates a collaborative ecosystem where each vehicle acts as an AI agent, sharing its position, velocity, and intent through a centralized communication layer. This ensures collective safety even when direct line-of-sight is unavailable.

### Key Features

* **V2X Communication Simulation**: A robust data-sharing layer where agents exchange state information (coordinates, speed, heading) via a common channel to build a comprehensive global map of the traffic environment.
* **AI Collision Risk Detection**: Real-time algorithms that analyze shared trajectories, calculate the probability of impact, and trigger preventive maneuvers.
* **Autonomous Decision Making**: Each vehicle is equipped with a logic engine that processes incoming V2X messages to decide whether to brake, accelerate, or yield.
* **Priority Negotiation**: Automated handling of right-of-way rules, including specialized protocols for emergency vehicle prioritization and standard traffic regulations.

## Technology Stack

The application is built with a focus on reactive performance, scalability, and a clean architectural separation:

* **Backend**: 
    * **Java & Spring Boot**: Core logic engine, agent coordination, and RESTful API services.
    * **Project Lombok**: Used for clean, boilerplate-free data modeling and maintainability.
* **Frontend**: 
    * **React.js**: A dynamic web interface for real-time simulation monitoring.
    * **React-spring**: Hardware-accelerated animation library used for smooth vehicle movement visualization.
* **Tools**: 
    * **Maven**: Dependency management and build automation.
    * **NPM**: Frontend package management.

## System Architecture

1.  **Simulation Engine**: Manages the physics, trajectories, and state updates of autonomous agents within a shared coordinate system.
2.  **Communication Layer**: A simulated messaging channel (representing V2X protocols) that allows agents to "perceive" vehicles beyond their immediate line-of-sight.
3.  **Conflict Resolver**: The AI component that monitors intersecting paths and negotiates movement to prevent gridlocks or collisions.
4.  **Visualization Dashboard**: A React-based interface providing a live top-down view of the intersection, telemetry data, and system alerts.

## Getting Started

### Prerequisites

* **Java 17** or superior
* **Node.js** (LTS version recommended)
* **Maven 3.8+**

### Installation & Execution

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/luk0111/SafeWays.git](https://github.com/luk0111/SafeWays.git)
    cd SafeWays
    ```

2.  **Run the Backend (Spring Boot)**
    ```bash
    cd backend
    mvn clean install
    mvn spring-boot:run
    ```

3.  **Run the Frontend (React)**
    ```bash
    cd frontend
    npm install
    npm start
    ```

## Development Context

SafeWays was developed as a technical solution for the **BEST Brașov Hackathon**, specifically addressing the **"Cooperative V2X Intersection Safety Agent"** challenge. The project demonstrates a functional end-to-end flow, from multi-agent data processing to real-time collision avoidance visualization.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
