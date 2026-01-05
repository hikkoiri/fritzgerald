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
    let root = assembleTree(allIps, 0, "");

    // check for multiple tld cidr block
    if (root.children!.length > 1) {
      root = {
        name: "Network",
        children: root.children
      };
    }
    else {
      root = {
        name: root.children![0].name,
        children: root.children![0].children
      };
    }

    const ipToEntities: Record<string, NetworkEntity[]> = {};
    devices.forEach(device => {
      if (!ipToEntities[device.ip]) ipToEntities[device.ip] = [];
      ipToEntities[device.ip].push(device);
    });

    function attachEntitiesToLeaves(node: RenderableNode, prefix: string) {
      if (!node.children || node.children.length === 0) {
        // This is a leaf node, try to match IPs
        const ip = node.name;
        if (ipToEntities[ip]) {
          node.children = ipToEntities[ip].map(entity => ({
            name: entity.friendly_name || entity.ip
          }));
        }
      } else {
        node.children.forEach(child => {
          attachEntitiesToLeaves(child, child.name);
        });
      }
    }
    attachEntitiesToLeaves(root, root.name);
    sortChildrenByName(root);

    return root;
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
    return { name: prefix.endsWith('.') ? prefix.slice(0, -1) : prefix, children };
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

    // Create the color scale.
    const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, data.children ? data.children.length + 1 : 1));

    // Compute the layout.
    const hierarchy = d3.hierarchy(data)
      .sum(d => (!d.children || d.children.length === 0) ? 1 : 0)

    const root = d3.partition<RenderableNode>()
      .size([height, (hierarchy.height + 1) * width / 3])
      (hierarchy);

    // Create the SVG container.
    const svg = d3.create("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("width", width)
      .attr("height", height)
      .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

    // Append cells.
    const cell = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<RenderableNode>>("g")
      .data(root.descendants())
      .join("g")
      .attr("transform", d => `translate(${d.y0},${d.x0})`);

    const rect = cell.append("rect")
      .attr("width", d => d.y1 - d.y0 - 1)
      .attr("height", d => rectHeight(d))
      .attr("fill-opacity", 0.6)
      .attr("fill", d => {
        let node = d;
        if (!node.depth) return "#ccc";
        while (node.depth > 1 && node.parent) node = node.parent;
        return color(node.data.name);
      })
      .style("cursor", "pointer")
      .on("click", clicked);

    const text = cell.append("text")
      .style("user-select", "none")
      .attr("pointer-events", "none")
      .attr("x", 4)
      .attr("y", 13)
      .attr("fill-opacity", d => +labelVisible(d));

    text.append("tspan")
      .text(d => d.data.name);

    const tspan = text.append("tspan")
      .attr("fill-opacity", d => (labelVisible(d) ? 1 : 0) * 0.7)

    // On click, change the focus and transitions it into view.
    let focus = root;
    function clicked(event: any, p: d3.HierarchyRectangularNode<RenderableNode>) {

      // Prevent error if p is null (e.g., clicking the root with no parent)
      if (!p || !p.parent) return;


      focus = focus === p ? p = p.parent! : p;

      root.each(d => {
        (d as any).target = {
          x0: (d.x0 - p.x0) / (p.x1 - p.x0) * height,
          x1: (d.x1 - p.x0) / (p.x1 - p.x0) * height,
          y0: d.y0 - p.y0,
          y1: d.y1 - p.y0
        };
      });

      const t = cell.transition().duration(750)
        .attr("transform", d => `translate(${(d as any).target.y0},${(d as any).target.x0})`);

      rect.transition().duration(750).attr("height", d => rectHeight((d as any).target));
      text.transition().duration(750).attr("fill-opacity", d => +labelVisible((d as any).target));
      tspan.transition().duration(750).attr("fill-opacity", d => (labelVisible((d as any).target) ? 1 : 0) * 0.7);
    }

    function rectHeight(d: any) {
      return d.x1 - d.x0 - Math.min(1, (d.x1 - d.x0) / 2);
    }

    function labelVisible(d: any) {
      return d.y1 <= width && d.y0 >= 0 && d.x1 - d.x0 > 16;
    }


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
