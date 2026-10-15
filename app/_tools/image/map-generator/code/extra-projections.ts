// d3-geo-projection resolves to its ESM source under Node/webpack and to the
// UMD bundle under Turbopack, where named exports are not statically visible.
// Normalize both shapes behind local named exports.
import * as d3GeoProjectionModule from "d3-geo-projection";
import type { GeoProjection } from "d3-geo";

type ProjectionFactory = () => GeoProjection;
type ProjectionModule = {
  geoRobinson?: ProjectionFactory;
  geoEckert4?: ProjectionFactory;
  default?: { geoRobinson: ProjectionFactory; geoEckert4: ProjectionFactory };
};

const projectionModule = d3GeoProjectionModule as unknown as ProjectionModule;

export const geoRobinson: ProjectionFactory =
  projectionModule.geoRobinson ??
  (projectionModule.default ? projectionModule.default.geoRobinson : undefined)!;

export const geoEckert4: ProjectionFactory =
  projectionModule.geoEckert4 ??
  (projectionModule.default ? projectionModule.default.geoEckert4 : undefined)!;
