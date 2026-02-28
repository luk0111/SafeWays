package controller;

import model.xml.CityMap;
import service.MapService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
// Permitem React-ului sa preia datele fara erori de CORS
@CrossOrigin(origins = "*")
public class MapController {

    private final MapService mapService;

    public MapController(MapService mapService) {
        this.mapService = mapService;
    }

    // React-ul va face fetch la http://localhost:8080/api/map
    @GetMapping("/api/map")
    public CityMap getMapData() {
        return mapService.getMap();
    }
}