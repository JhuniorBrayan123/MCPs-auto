import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BookStackClient } from "./bookstackClient.js";

// Carga el .env de la RAÍZ del proyecto por ruta explícita, sin depender
// del cwd ni de la inyección de OpenCode. Desde dist/ (o src/) el .env de
// la raíz queda 3 niveles arriba: tools/mcp-bookstack/dist/../../../.env
// dotenv no sobreescribe variables ya seteadas: si OpenCode inyecta valores
// válidos, esos ganan; si no inyecta nada, este fallback los toma.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });
// Fallback adicional: .env local dentro de la carpeta del MCP (opcional)
loadEnv();

const bookStack = new BookStackClient();

const server = new McpServer({
  name: "bookstack-documentation-mcp",
  version: "1.0.0"
});

server.registerTool(
  "bookstack_list_books",
  {
    title: "Listar libros de BookStack",
    description: "Lista los libros disponibles en BookStack.",
    inputSchema: {}
  },
  async () => {
    const result = await bookStack.listBooks();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "bookstack_list_chapters",
  {
    title: "Listar capítulos de BookStack",
    description: "Lista los capítulos disponibles en BookStack.",
    inputSchema: {}
  },
  async () => {
    const result = await bookStack.listChapters();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "bookstack_search",
  {
    title: "Buscar contenido en BookStack",
    description: "Busca páginas, libros o capítulos dentro de BookStack.",
    inputSchema: {
      query: z.string().min(1).describe("Texto a buscar en BookStack")
    }
  },
  async ({ query }) => {
    const result = await bookStack.search(query);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "bookstack_get_page",
  {
    title: "Leer página de BookStack",
    description: "Obtiene el contenido completo de una página de BookStack por ID.",
    inputSchema: {
      pageId: z.number().int().positive().describe("ID de la página")
    }
  },
  async ({ pageId }) => {
    const result = await bookStack.getPage(pageId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "bookstack_create_page",
  {
    title: "Crear página en BookStack",
    description:
      "Crea una página nueva en BookStack usando Markdown. Por seguridad, primero puede ejecutarse en modo dryRun.",
    inputSchema: {
      name: z.string().min(1).describe("Título de la página"),
      markdown: z.string().min(1).describe("Contenido Markdown de la página"),
      bookId: z.number().int().positive().optional().describe("ID del libro"),
      chapterId: z.number().int().positive().optional().describe("ID del capítulo"),
      dryRun: z.boolean().default(true).describe("Si es true, no crea la página; solo muestra lo que haría")
    }
  },
  async ({ name, markdown, bookId, chapterId, dryRun }) => {
    if (!bookId && !chapterId) {
      throw new Error("Debes enviar bookId o chapterId");
    }

    if (dryRun) {
      return {
        content: [
          {
            type: "text",
            text:
              "DRY RUN: No se creó la página.\n\n" +
              JSON.stringify(
                {
                  name,
                  book_id: bookId,
                  chapter_id: chapterId,
                  markdown
                },
                null,
                2
              )
          }
        ]
      };
    }

    const result = await bookStack.createPage({
      name,
      book_id: bookId,
      chapter_id: chapterId,
      markdown,
      tags: [
        { name: "origen", value: "mcp" },
        { name: "area", value: "qa-automation" }
      ]
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

server.registerTool(
  "bookstack_update_page",
  {
    title: "Actualizar página en BookStack",
    description:
      "Actualiza una página existente en BookStack usando Markdown. Por seguridad, primero puede ejecutarse en modo dryRun.",
    inputSchema: {
      pageId: z.number().int().positive().describe("ID de la página"),
      name: z.string().min(1).optional().describe("Nuevo título opcional"),
      markdown: z.string().min(1).describe("Nuevo contenido Markdown"),
      dryRun: z.boolean().default(true).describe("Si es true, no actualiza la página; solo muestra lo que haría")
    }
  },
  async ({ pageId, name, markdown, dryRun }) => {
    if (dryRun) {
      return {
        content: [
          {
            type: "text",
            text:
              "DRY RUN: No se actualizó la página.\n\n" +
              JSON.stringify(
                {
                  pageId,
                  name,
                  markdown
                },
                null,
                2
              )
          }
        ]
      };
    }

    const result = await bookStack.updatePage({
      pageId,
      name,
      markdown,
      tags: [
        { name: "origen", value: "mcp" },
        { name: "area", value: "qa-automation" }
      ]
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
