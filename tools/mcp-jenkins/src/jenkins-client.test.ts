import { test } from "node:test";
import assert from "node:assert/strict";
import { jobApiPath } from "./jenkins-client.js";

test("jobApiPath: job simple", () => {
  assert.equal(jobApiPath("mi-job"), "job/mi-job");
});

test("jobApiPath: job dentro de carpeta anidada", () => {
  assert.equal(jobApiPath("carpeta/subcarpeta/mi-job"), "job/carpeta/job/subcarpeta/job/mi-job");
});

test("jobApiPath: encodea segmentos con espacios/caracteres especiales", () => {
  assert.equal(jobApiPath("mi carpeta/job#1"), "job/mi%20carpeta/job/job%231");
});

test("jobApiPath: ignora barras extra y espacios en blanco", () => {
  assert.equal(jobApiPath("/ carpeta / job /"), "job/carpeta/job/job");
});

test("jobApiPath: lanza error con ruta vacía", () => {
  assert.throws(() => jobApiPath(""), /no puede estar vacío/);
});
