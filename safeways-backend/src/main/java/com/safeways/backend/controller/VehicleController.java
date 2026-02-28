package com.safeways.backend.controller;

import com.safeways.backend.service.VehicleSimulationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api/vehicles")
public class VehicleController {

    @Autowired
    private VehicleSimulationService vehicleService;

    @GetMapping
    public List<Map<String, Object>> getVehicles() {
        return vehicleService.getVehicleStates();
    }

    @PostMapping("/spawn")
    public Map<String, Object> spawnVehicle() {
        return vehicleService.spawnVehicle();
    }

    @GetMapping("/graph")
    public Map<String, Object> getGraph() {
        return vehicleService.getGraphInfo();
    }
}

