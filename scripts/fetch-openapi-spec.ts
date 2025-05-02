import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url'; // Import necessary function

// Determine the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// URL of the OpenAPI specification
const url = "https://coddingtonbear.github.io/obsidian-local-rest-api/openapi.yaml";
const outputDir = path.resolve(__dirname, '../docs/obsidian-api'); // Use path.resolve for absolute path
const yamlOutputPath = path.join(outputDir, 'obsidian_rest_api_spec.yaml');
const jsonOutputPath = path.join(outputDir, 'obsidian_rest_api_spec.json');

async function fetchAndSaveSpec() {
  try {
    console.log(`Fetching OpenAPI spec from ${url}...`);
    const response = await axios.get(url);
    const openapiSpec = yaml.load(response.data); // Use load instead of safe_load for potentially complex YAML

    if (!openapiSpec) {
      throw new Error("Failed to parse YAML content.");
    }

    // Ensure the output directory exists
    if (!fs.existsSync(outputDir)) {
      console.log(`Creating output directory: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save as YAML
    console.log(`Saving YAML spec to ${yamlOutputPath}...`);
    fs.writeFileSync(yamlOutputPath, yaml.dump(openapiSpec), 'utf8');

    // Save as JSON
    console.log(`Saving JSON spec to ${jsonOutputPath}...`);
    fs.writeFileSync(jsonOutputPath, JSON.stringify(openapiSpec, null, 2), 'utf8');

    console.log("OpenAPI specification downloaded and saved successfully.");

  } catch (error) {
    console.error("Error fetching or saving OpenAPI specification:", error);
    process.exit(1); // Exit with error code
  }
}

fetchAndSaveSpec();
