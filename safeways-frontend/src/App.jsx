import React, { useState, useEffect } from 'react';
import { createV2xClient } from './services/v2xService';
import IntersectionMap from './components/IntersectionMap';

function App() {
    const [vehicles, setVehicles] = useState([
        { id: 'Masina-1', type: 'NORMAL', x: 100, y: 100, speed: 50, intention: 'FATA' }
    ]);

    useEffect(() => {
        const client = createV2xClient((decision) => {
            console.log("Decizie AI primită:", decision);
            // Aici aplicăm decizia (FRÂNEAZĂ/ACCELEREAZĂ) în animație
        });
        client.activate();
        return () => client.deactivate();
    }, []);

    return (
        <div className="App">
            <h1>SafeWays V2X Dashboard</h1>
            <IntersectionMap vehicles={vehicles} />
        </div>
    );
}

export default App;