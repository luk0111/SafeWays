package model.xml;

import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlElementWrapper;
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlProperty;
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlRootElement;
import lombok.Data;
import java.util.List;

@Data
@JacksonXmlRootElement(localName = "map")
public class CityMap {

    @JacksonXmlProperty(isAttribute = true)
    private String description;

    @JacksonXmlElementWrapper(localName = "nodes")
    @JacksonXmlProperty(localName = "node")
    private List<MapNode> nodes;

    @JacksonXmlElementWrapper(localName = "arcs")
    @JacksonXmlProperty(localName = "arc")
    private List<MapArc> arcs;
}