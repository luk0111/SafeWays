package com.safeways.backend.controller;

import com.safeways.backend.service.IntersectionAntenna;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/antenna")
@CrossOrigin(origins = "*")
public class AntennaController {

    @Autowired
    private IntersectionAntenna intersectionAntenna;

    /**
     * Get live data from all vehicles in antenna range
     * Includes speeding information (vehicles over 50 km/h)
     */
    @GetMapping("/live")
    public Map<String, Object> getLiveData() {
        Map<String, Object> response = new HashMap<>();
        response.put("vehicles", intersectionAntenna.getLiveVehicleData());
        response.put("speedingVehicles", intersectionAntenna.getSpeedingVehicles());
        response.put("totalCount", intersectionAntenna.getVehicleCount());
        response.put("speedingCount", intersectionAntenna.getSpeedingVehicleCount());
        response.put("speedLimit", intersectionAntenna.getSpeedLimit());
        response.put("antennaRangeMeters", intersectionAntenna.getAntennaRangeMeters());
        return response;
    }

    /**
     * Get only vehicles that are speeding (over 50 km/h)
     */
    @GetMapping("/speeding")
    public List<IntersectionAntenna.VehicleLiveData> getSpeedingVehicles() {
        return intersectionAntenna.getSpeedingVehicles();
    }

    /**
     * Get current speed limit
     */
    @GetMapping("/speed-limit")
    public Map<String, Object> getSpeedLimit() {
        Map<String, Object> response = new HashMap<>();
        response.put("speedLimit", intersectionAntenna.getSpeedLimit());
        return response;
    }
}

