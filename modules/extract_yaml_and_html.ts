import jsyaml from "js-yaml";

function extractYAMLAndHTML(text: string) {
    const yamlStartIndex = text.indexOf("---");
    const yamlEndIndex = text.indexOf("---", yamlStartIndex + 3);

    if (yamlStartIndex !== -1 && yamlEndIndex !== -1) {
        const yamlText = text.slice(yamlStartIndex + 3, yamlEndIndex);
        const htmlText = text.slice(yamlEndIndex + 3);

        return {
            yaml: jsyaml.load(yamlText),
            html: htmlText
        };
    } else {
        throw new Error("YAML not found");
    }
}

export default extractYAMLAndHTML;