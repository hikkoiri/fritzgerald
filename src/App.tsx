import { useEffect, useState, useRef } from 'react';
import './App.css';
import * as d3 from 'd3';

//interfaces
export interface NetworkEntity {
  uid: string;
  ip: string;
  active: boolean;
  friendly_name: string;
  firstused: string;
  lastused: string;
  online: boolean;
  static_dhcp: boolean;
  flags: string;
}

export interface RenderableNode {
  name: string;
  children?: RenderableNode[];
}

//config
const discoveryEndpoint = 'https://fritzi.internal.carlo-hildebrandt.de/api/v1/landevices';

function App() {

  const [loading, setLoading] = useState(true);
  const [networkEntities, setNetworkEntities] = useState<NetworkEntity[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(discoveryEndpoint);
      const data = await response.json();
      setNetworkEntities(data);
      setLoading(false);
    };
    fetchData();
  }, []);


  function prepareList(devices: NetworkEntity[]): RenderableNode {
    // Find the common prefix for all IPs to use as the root name
    devices = devices.filter(device => device.ip !== "");
    const allIps = devices.map(device => device.ip);
    const root = assembleTree(allIps, 0, "");
    sortChildrenByName(root);
    if (root.children!.length > 1) {
      return {
        name: "Network",
        children: root.children
      };
    }
    else {
      return {
        name: root.children![0].name,
        children: root.children![0].children
      };
    }
  }

  function assembleTree(allIps: string[], level: number, prefix: string): RenderableNode {
    const partsForGivenPrefix = allIps
      .filter(ip => ip.startsWith(prefix))
      .map(ip => ip.split('.')[level]);

    const uniqueParts = Array.from(new Set(partsForGivenPrefix));

    console.log(`For level ${level} and prefix '${prefix}' found parts:`, uniqueParts);
    const children: RenderableNode[] = [];
    for (const part of uniqueParts) {
      const nextLevelPrefix = prefix + part + '.';
      let nextLevel = assembleTree(allIps, level + 1, nextLevelPrefix);

      // if only one child, collapse, unless it's the last level (IP level)
      if (nextLevel.children && nextLevel.children.length === 1 && level < 2) {
        children.push({
          name: nextLevel.name,
          children: nextLevel.children[0].children
        });
      }
      else {
        children.push(nextLevel);
      }
    }
    return { name: prefix, children };
  }


  function sortChildrenByName(node: RenderableNode) {
    if (node.children && node.children.length > 0) {
      node.children.sort((a, b) => a.name.localeCompare(b.name));
      node.children.forEach(sortChildrenByName);
    }
  }

  function renderNetworkEntities(data: RenderableNode, container: HTMLDivElement | null) {
    // Specify the chart’s dimensions as 80% of viewport
    const width = Math.floor(window.innerWidth * 0.8);
    const height = Math.floor(window.innerHeight * 0.8);

    // Create a color scale (a color for each child of the root node and their descendants).
    const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, data.children!.length + 1))

    // Create a partition layout.
    const partition = d3.partition<RenderableNode>()
      .size([height, width])
      .padding(1);

    // Build hierarchy and assign equal value to all leaves
    const hierarchy = d3.hierarchy<RenderableNode>(data);
    // No need to clear previous value, just assign equal value to leaves below
    function assignEqualLeafValue(node: d3.HierarchyNode<RenderableNode>): number {
      if (!node.children || node.children.length === 0) {
        return 1;
      } else {
        node.children.forEach(assignEqualLeafValue);
        return 0;
      }
    }
    assignEqualLeafValue(hierarchy);
    hierarchy.sum((d: RenderableNode) => (!d.children || d.children.length === 0) ? 1 : 0);
    // Apply the partition layout.
    const root: d3.HierarchyRectangularNode<RenderableNode> = partition(hierarchy);

    // Create the SVG container.
    const svg = d3.create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "display: block; margin: auto; width: 80vw; height: 80vh; font: 10px sans-serif;");

    // Add a cell for each node of the hierarchy using the new root from the partition layout.
    const cell = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<RenderableNode>>("g")
      .data(root.descendants())
      .join("g")
      .attr("transform", (d: d3.HierarchyRectangularNode<RenderableNode>) => `translate(${d.y0},${d.x0})`);

    cell.append("title")
      .text((d: d3.HierarchyRectangularNode<RenderableNode>) => d.ancestors().map((a: d3.HierarchyRectangularNode<RenderableNode>) => a.data.name).reverse().join("/"));

    // Color the cell with respect to which child of root it belongs to. 
    cell.append("rect")
      .attr("width", (d: d3.HierarchyRectangularNode<RenderableNode>) => d.y1 - d.y0)
      .attr("height", (d: d3.HierarchyRectangularNode<RenderableNode>) => d.x1 - d.x0)
      .attr("fill-opacity", 0.6)
      .attr("fill", (d: d3.HierarchyRectangularNode<RenderableNode>): string => {
        let node: d3.HierarchyRectangularNode<RenderableNode> = d;
        if (!node.depth) return "#ccc";
        while (node.depth > 1 && node.parent) node = node.parent;
        return color(node.data.name);
      });

    // Add labels.
    const text = cell
      .filter((d: d3.HierarchyRectangularNode<RenderableNode>) => (d.x1 - d.x0) > 16)
      .append("text")
      .attr("x", 4)
      .attr("y", 13);

    text.append("tspan")
      .text((d: d3.HierarchyRectangularNode<RenderableNode>) => d.data.name);

    if (container) {
      container.innerHTML = '';
      if (svg.node()) {
        container.appendChild(svg.node()!);
      }
    }
  }

  function NetworkEntitiesChart() {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      renderNetworkEntities(prepareList(networkEntities), chartRef.current);
    }, []);

    // Center the chart using flexbox
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100vw', height: '100vh' }}>
        <div ref={chartRef} style={{ width: '80vw', height: '80vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
      </div>
    );
  }

  return (
    <>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <NetworkEntitiesChart />
      )}
    </>
  );
}

export default App;
