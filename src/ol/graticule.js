goog.provide('ol.Graticule');

goog.require('goog.asserts');
goog.require('goog.math');
goog.require('ol.Observable');
goog.require('ol.extent');
goog.require('ol.geom.LineString');
goog.require('ol.geom.flat.geodesic');
goog.require('ol.proj');
goog.require('ol.render.EventType');
goog.require('ol.sphere.NORMAL');
goog.require('ol.style.Stroke');



/**
* @classdesc
* A class representing a graticule drawn on top of the map.
* The default graticule is a Latitiude / Longitude one (EPSG:4326)
* For other graticules, supply a projection option to the constructor.
* For non default intervals (which are selected by zoom/resolution),
* supply an intervals option to the constructor.
*
* @constructor
* @param {olx.GraticuleOptions=} opt_options Options.
* @extends {ol.Observable}
* @fires change Triggered when the graticule interval or map changes.
* @api
*/
ol.Graticule = function(opt_options) {

  goog.base(this);

  var options = goog.isDef(opt_options) ? opt_options : {};

  /**
    * @type {ol.Map}
    * @private
    */
  this.map_ = null;

  /**
    * @type {ol.proj.Projection}
    * @private
    */
  this.proj4326_ = ol.proj.get('EPSG:4326');

  /**
    * @type {ol.proj.Projection}
    * @private
    */
  this.projGrat_ = goog.isDef(options.projection) ?
      ol.proj.get(options.projection) : this.proj4326_;

  /**
    * @type {ol.TransformFunction}
    * @private
    */
  this.projGratToProj4326_ = ol.proj.getTransformFromProjections(
      this.projGrat_, this.proj4326_);

  /**
    * @type {ol.TransformFunction}
    * @private
    */
  this.proj4326ToProjGrat_ = ol.proj.getTransformFromProjections(
      this.proj4326_, this.projGrat_);

  /**
    * @type {ol.Extent}
    * @private
    */
  this.projGratExtent_ = this.projGrat_.getExtent();

  /**
    * @type {ol.Extent}
    * @private
    */
  this.projGratWorldExtent_ = this.projGrat_.getWorldExtent();
  if (goog.isNull(this.projGratWorldExtent_)) {
    this.projGratWorldExtent_ = ol.extent.applyTransform(
        this.projGratExtent_,
        this.projGratToProj4326_);
  }

  /**
    * @type {ol.proj.Units}
    * @private
    */
  this.projGratUnits_ = this.projGrat_.getUnits();

  /**
    * @type {ol.proj.Projection}
    * @private
    */
  this.projView_ = null;

  /**
    * @type {ol.Extent}
    * @private
    */
  this.projViewExtent_ = null;

  /**
    * @type {ol.Extent}
    * @private
    */
  this.projViewWorldExtent_ = null;

  /**
    * @type {ol.TransformFunction}
    * @private
    */
  this.projViewToProj4326_ = ol.proj.identityTransform;

  /**
    * @type {ol.TransformFunction}
    * @private
    */
  this.proj4326ToProjView_ = ol.proj.identityTransform;

  /**
    * @type {ol.TransformFunction}
    * @private
    */
  this.projGratToProjView_ = ol.proj.identityTransform;

  /**
    * @type {ol.TransformFunction}
    * @private
    */
  this.projViewToProjGrat_ = ol.proj.identityTransform;

  /**
    * @type {boolean}
    * @private
    */
  this.projectionsEquivalent_ = false;

  /**
    * @type {Array.<number>}
    * @private
    */
  this.intervals_ = (this.projGratUnits_ == ol.proj.Units.DEGREES) ?
      ol.Graticule.DEFAULT_DEGREE_INTERVALS_ :
      ol.Graticule.DEFAULT_DISTANCE_INTERVALS_;
  this.intervals_ = goog.isDef(options.intervals) ? options.intervals :
      this.intervals_;

  /**
    * @type {number}
    * @private
    */
  this.maxY_ = Infinity;

  /**
    * @type {number}
    * @private
    */
  this.maxX_ = Infinity;

  /**
    * @type {number}
    * @private
    */
  this.minY_ = -Infinity;

  /**
    * @type {number}
    * @private
    */
  this.minX_ = -Infinity;

  /**
    * @type {number}
    * @private
    */
  this.targetSize_ = goog.isDef(options.targetSize) ?
      options.targetSize : 100;

  /**
    * @type {number}
    * @private
    */
  this.maxLines_ = goog.isDef(options.maxLines) ? options.maxLines : 100;
  goog.asserts.assert(this.maxLines_ > 0,
      'options.maxLines should be more than 0');

  /**
    * @type {number}
    * @private
    */
  this.interval_ = Infinity;

  /**
    * @type {Array.<ol.geom.LineString>}
    * @private
    */
  this.meridians_ = [];

  /**
    * @type {Array.<ol.geom.LineString>}
    * @private
    */
  this.parallels_ = [];

  /**
    * @type {ol.style.Stroke}
    * @private
    */
  this.strokeStyle_ = goog.isDef(options.strokeStyle) ?
      options.strokeStyle : ol.Graticule.DEFAULT_STROKE_STYLE_;

  this.setMap(goog.isDef(options.map) ? options.map : null);
};
goog.inherits(ol.Graticule, ol.Observable);


/**
* @type {ol.style.Stroke}
* @private
* @const
*/
ol.Graticule.DEFAULT_STROKE_STYLE_ = new ol.style.Stroke({
  color: 'rgba(0,0,0,0.2)'
});


/**
* default intervals for graticule when projection units are degrees
* @type {Array.<number>}
* @private
* @const
*/
ol.Graticule.DEFAULT_DEGREE_INTERVALS_ = [90, 45, 30, 15, 10, 5, 2, 1,
  30 / 60, 20 / 60, 10 / 60, 5 / 60, 3 / 60, 2 / 60, 1 / 60,
  30 / 3600, 20 / 3600, 10 / 3600, 5 / 3600, 3 / 3600, 2 / 3600, 1 / 3600];


/**
* default intervals for graticule when projection units are not degreees
* @type {Array.<number>}
* @private
* @const
*/
ol.Graticule.DEFAULT_DISTANCE_INTERVALS_ = [1000000, 500000, 200000, 100000,
  50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];


/**
* @param {number} lon Longitude or X coord.
* @param {number} squaredTolerance Squared tolerance for curve fitting.
* @param {ol.Extent} extent View Extent.
* @param {number} index Index.
* @return {number} Index, incremented if meridian visible in extent
* @private
*/
ol.Graticule.prototype.addMeridian_ =
    function(lon, squaredTolerance, extent, index) {
  var lineString = this.getMeridian_(lon, squaredTolerance, index);
  if (ol.extent.intersects(lineString.getExtent(), extent)) {
    this.meridians_[index++] = lineString;
  }
  return index;
};


/**
* @param {number} centerX Central meridian X coord (metres)
* @param {number} resolution Nominal resolution in metres per pixel
* @param {number} offset from Central meridian (metres)
* @param {number} squaredTolerance Squared tolerance for curve fitting.
* @param {ol.Extent} extent View Extent.
* @param {number} index Index.
* @return {number} Index, incremented if meridian visible in extent
* @private
*/
ol.Graticule.prototype.addMeridian3857_ =
    function(centerX, resolution, offset, squaredTolerance, extent, index) {
  var lineString = this.getMeridian3857_(centerX, resolution, offset,
      squaredTolerance, index);
  if (ol.extent.intersects(lineString.getExtent(), extent)) {
    this.meridians_[index++] = lineString;
  }
  return index;
};


/**
* @param {number} lat Latitude or Y coord.
* @param {number} squaredTolerance Squared tolerance for curve fitting.
* @param {ol.Extent} extent View Extent.
* @param {number} index Index.
* @return {number} Index, incremented if parallel visible in extent
* @private
*/
ol.Graticule.prototype.addParallel_ =
    function(lat, squaredTolerance, extent, index) {
  var lineString = this.getParallel_(lat, squaredTolerance, index);
  if (ol.extent.intersects(lineString.getExtent(), extent)) {
    this.parallels_[index++] = lineString;
  }
  return index;
};


/**
* Determine the nominal extent of the graticule for rendering
* This is actually quite tricky at low zooms, when the view extent
* may be bigger than the view's projection extent or the graticule's
* projection extent is small compared to the view's extent.
*
* @param {ol.Coordinate} center Point.
* @param {ol.Extent} extent view extent.
* @return {ol.Extent} extent of graticule to draw or null
* @private
*/
ol.Graticule.prototype.calcGraticuleExtent_ = function(center, extent) {

  var graticuleExtent;

  var w = ol.extent.getWidth(extent);
  var h = ol.extent.getHeight(extent);
  var vpExtent = this.projViewExtent_;
  var vpWorldExtent = this.projViewWorldExtent_;
  var gratWorldWidth = ol.extent.getWidth(this.projGratWorldExtent_);
  var gratWorldHeight = ol.extent.getHeight(this.projGratWorldExtent_);

  var extent4326 = ol.extent.applyTransform(extent,
      this.projViewToProj4326_);

  /* if top left or bottom right of view extent lie outside
    the view's projection extent, limit the 4326 view extent
    to its projection's world extent corners. */
  if (!ol.extent.containsCoordinate(vpExtent,
      ol.extent.getTopRight(extent))) {
    extent4326[2] = vpWorldExtent[2];
    extent4326[3] = vpWorldExtent[3];
  }
  if (!ol.extent.containsCoordinate(vpExtent,
      ol.extent.getBottomLeft(extent))) {
    extent4326[0] = vpWorldExtent[0];
    extent4326[1] = vpWorldExtent[1];
  }

  var revExtent = ol.extent.applyTransform(extent4326,
      this.proj4326ToProjView_);

  var revCenter = ol.extent.getCenter(revExtent);
  var revW = ol.extent.getWidth(revExtent);
  var revH = ol.extent.getHeight(revExtent);

  /* look for signs of a broken to/from EPSG:4326 transform
    this happens e.g. for off earth Mollweide rectangular view corners
    we look for reverse 4326 xformed centre being in a similar spot
    and width and height being similar */
  if ((!goog.math.nearlyEquals(center[0], revCenter[0], w / 10)) ||
      (!goog.math.nearlyEquals(center[1], revCenter[1], h / 10)) ||
      (!goog.math.nearlyEquals(revW, w, w / 10)) ||
      (!goog.math.nearlyEquals(revH, h, h / 10))) {

    /* limit to the intersection of the view and graticule world extents */
    extent4326 = ol.extent.getIntersection(
        vpWorldExtent,
        this.projGratWorldExtent_);
    graticuleExtent = ol.extent.applyTransform(extent4326,
        this.proj4326ToProjGrat_);
  }
  else if (!ol.extent.intersects(extent4326, this.projGratWorldExtent_)) {

    /* the view's world extent does not intersect graticule's world extent  */
    return null;
  }
  else if (ol.extent.containsExtent(extent4326, this.projGratWorldExtent_)) {

    /* The view contains the extent of the graticule's projection */
    graticuleExtent = this.projGratExtent_;
  }
  else if ((ol.extent.getWidth(extent4326) > gratWorldWidth) ||
          (ol.extent.getHeight(extent4326) > gratWorldHeight)) {

    /* view has a dimension greater than the projection */
    graticuleExtent = this.projGratExtent_;
  }
  else {

    /* Finally the normal case ! */
    graticuleExtent = (!this.projectionsEquivalent_) ?
            ol.extent.applyTransform(
            ol.extent.getIntersection(extent, vpExtent),
            this.projViewToProjGrat_) :
            extent;
  }

  return graticuleExtent;
};


/**
* @param {number} resolution Adjusted Resolution in graticule projn units.
* @return {number} The interval in graticule projection units.
* @private
*/
ol.Graticule.prototype.calcInterval_ = function(resolution) {

  var interval = this.intervals_[0];
  var i, ii;
  var target = this.targetSize_ * resolution;
  var intervals = this.intervals_;

  for (i = 0, ii = intervals.length; i < ii; ++i) {
    if (intervals[i] <= target) {
      break;
    }
    interval = intervals[i];
  }

  return interval;
};


/**
* @param {number} interval Graticule Interval.
* @param {ol.Extent} graticuleExtent nominal Graticule extent to be rendered.
* @private
*/
ol.Graticule.prototype.calcGridBounds_ = function(interval, graticuleExtent) {

  /* There are some cases where a rectangle straddling the centre of e.g.
    the UK grid has a higher latitude at the centre of it's top side then
    the two ends of the top side. To cope with this, we add on one
    more interval and limit to the projection's bounds.
    UTM would have the same issue. */

  this.maxY_ = (Math.ceil(graticuleExtent[3] / interval) * interval) +
      interval;
  this.maxX_ = (Math.ceil(graticuleExtent[2] / interval) * interval) +
      interval;
  this.minY_ = (Math.floor(graticuleExtent[1] / interval) * interval) -
      interval;
  this.minX_ = (Math.floor(graticuleExtent[0] / interval) * interval) -
      interval;

  // limit graticule to extent of graticule's projection

  var maxExtent = this.projGratExtent_;

  this.maxY_ = (this.maxY_ > maxExtent[3]) ? maxExtent[3] : this.maxY_;
  this.maxX_ = (this.maxX_ > maxExtent[2]) ? maxExtent[2] : this.maxX_;
  this.minY_ = (this.minY_ < maxExtent[1]) ? maxExtent[1] : this.minY_;
  this.minX_ = (this.minX_ < maxExtent[0]) ? maxExtent[0] : this.minX_;

  if (this.projGratUnits_ == ol.proj.Units.DEGREES) {

    maxExtent = this.projViewWorldExtent_;

    if (ol.extent.containsExtent(this.projGratWorldExtent_, maxExtent)) {

      // limit lat/lon graticule to world extent of view's projection

      this.maxY_ = (this.maxY_ > maxExtent[3]) ? maxExtent[3] : this.maxY_;
      this.maxX_ = (this.maxX_ > maxExtent[2]) ? maxExtent[2] : this.maxX_;
      this.minY_ = (this.minY_ < maxExtent[1]) ? maxExtent[1] : this.minY_;
      this.minX_ = (this.minX_ < maxExtent[0]) ? maxExtent[0] : this.minX_;
    }
  }
  else {

    maxExtent = ol.extent.applyTransform(this.projViewWorldExtent_,
        this.proj4326ToProjGrat_);

    if (ol.extent.containsExtent(this.projGratExtent_, maxExtent)) {

      // limit graticule to extent of view's projection's extent

      this.maxY_ = (this.maxY_ > maxExtent[3]) ? maxExtent[3] : this.maxY_;
      this.maxX_ = (this.maxX_ > maxExtent[2]) ? maxExtent[2] : this.maxX_;
      this.minY_ = (this.minY_ < maxExtent[1]) ? maxExtent[1] : this.minY_;
      this.minX_ = (this.minX_ < maxExtent[0]) ? maxExtent[0] : this.minX_;
    }
  }
};


/**
* Truncate coordinates of meridian to projection extent
* @param {Array.<number>} flatCoordinates
* @private
*/
ol.Graticule.prototype.clip3857Meridian_ = function(flatCoordinates) {

  // This code only operates at world type views.
  // The y coords are never outside the projection extent.
  // First truncate meridians to one point outside the projection area
  // We assume it is ends of lines that lie outside

  var minX = this.projGratExtent_[0];
  var maxX = this.projGratExtent_[2];

  var ll = flatCoordinates.length;
  goog.asserts.assert(ll >= 4,
      'flatCoordinates length should be greater or equal to 4');
  var end = ll - 4;
  var start = 2;

  while (((flatCoordinates[end] < minX) ||
      (flatCoordinates[end] > maxX)) &&
          (end > 0)) {
    end -= 2;
  }
  while (((flatCoordinates[start] < minX) ||
      (flatCoordinates[start] > maxX)) &&
          (start < ll)) {
    start += 2;
  }

  // leave just one point at each end outside the extent
  if ((start != 2) || (end != (ll - 4))) {

    flatCoordinates.splice(0, start - 2);
    end -= (start - 2);
    ll -= (start - 2);
    flatCoordinates.splice(end + 4, ll - (end + 4));
    ll -= ll - (end + 4);
  }

  // Interpolate final line segments to edge of projection area

  if (ll >= 4) {

    if (flatCoordinates[ll - 2] < minX) {
      this.lineEndAtX_(flatCoordinates, minX);
    }
    if (flatCoordinates[0] < minX) {
      this.lineStartAtX_(flatCoordinates, minX);
    }
    if (flatCoordinates[ll - 2] > maxX) {
      this.lineEndAtX_(flatCoordinates, maxX);
    }
    if (flatCoordinates[0] > maxX) {
      this.lineStartAtX_(flatCoordinates, maxX);
    }
  }

};


/**
* @param {ol.Extent} viewExtent Extent of View.
* @param {ol.Coordinate} center Point of View.
* @param {number} resolution Resolution of view.
* @param {number} squaredTolerance Squared tolerance (curve accuracy).
* @private
*/
ol.Graticule.prototype.createGraticule_ =
    function(viewExtent, center, resolution, squaredTolerance) {


  if ((this.projGratUnits_ == ol.proj.Units.DEGREES) &&
      (this.projView_.getUnits() != ol.proj.Units.DEGREES)) {

    // graticule projection has units of degrees and view does not,
    // so get resolution of view projection in degrees.
    resolution = this.getDegreesResolution_(resolution, center);
  }

  /* Limit render extent to intersection of view and its projection */
  var extent = ol.extent.getIntersection(viewExtent, this.projViewExtent_);

  /* Compute graticule extent and check plausible to plot. */
  var graticuleExtent = this.calcGraticuleExtent_(center,
      ol.extent.clone(extent));

  if (goog.isNull(graticuleExtent)) {
    this.meridians_.length = this.parallels_.length = 0;
    return;
  }

  /* Get adjusted resolution at graticule center. */
  var graticuleCenter = ol.extent.getCenter(graticuleExtent);
  var adjustedResolution =
      this.projGrat_.getPointResolution(resolution, graticuleCenter);

  /* Check for out of graticule projection area issues. */
  if (adjustedResolution == 0) {
    this.meridians_.length = this.parallels_.length = 0;
    return;
  }

  /* Must use adjusted resn to get sensible interval at extreme latitudes. */
  var interval = this.calcInterval_(adjustedResolution);
  if (interval != this.interval_) {
    this.interval_ = interval;
    this.changed();
  }

  /* For projections such as EPSG:3857, scale changes with latitude. For
        EPSG:4326, EPSG:27700, scale is constant
        and adjustedResolution = resolution.  */
  interval *= resolution / adjustedResolution;

  /* Re-limit graticule bounds now interval known */
  this.calcGridBounds_(interval, graticuleExtent);

  if (this.projGrat_.getCode() !== 'EPSG:3857') {

    /* anchor grid to the map */
    graticuleCenter[0] = Math.floor(graticuleCenter[0] / interval) * interval;
    graticuleCenter[1] = Math.floor(graticuleCenter[1] / interval) * interval;

    this.drawRegularGrid_(interval, graticuleCenter, extent,
        squaredTolerance);
  }
  else {

    /* anchor grid to the screen, map slips behind it */
    this.draw3857Grid_(resolution, graticuleCenter, extent,
        squaredTolerance);
  }

};


/**
* @param {number} interval adjusted grid inteval.
* @param {ol.Coordinate} graticuleCenter Centre of view.
* @param {ol.Extent} extent Extent of View.
* @param {number} squaredTolerance Squared tolerance (curve accuracy).
* @private
*/
ol.Graticule.prototype.drawRegularGrid_ = function(interval,
    graticuleCenter, extent, squaredTolerance) {

  var centerX = goog.math.clamp(graticuleCenter[0], this.minX_, this.maxX_);
  var centerY = goog.math.clamp(graticuleCenter[1], this.minY_, this.maxY_);
  var maxLines = this.maxLines_;
  var cnt, idx, lat, lon;

  // Create meridians
  idx = this.addMeridian_(centerX, squaredTolerance, extent, 0);
  cnt = 0;
  lon = centerX - interval;
  while (lon >= this.minX_ && cnt++ < maxLines) {
    idx = this.addMeridian_(lon, squaredTolerance, extent, idx);
    lon -= interval;
  }
  cnt = 0;
  lon = centerX + interval;
  while (lon <= this.maxX_ && cnt++ < maxLines) {
    idx = this.addMeridian_(lon, squaredTolerance, extent, idx);
    lon += interval;
  }
  this.meridians_.length = idx;

  // Create parallels
  idx = this.addParallel_(centerY, squaredTolerance, extent, 0);
  cnt = 0;
  lat = centerY - interval;
  while (lat >= this.minY_ && cnt++ < maxLines) {
    idx = this.addParallel_(lat, squaredTolerance, extent, idx);
    lat -= interval;
  }
  cnt = 0;
  lat = centerY + interval;
  while (lat <= this.maxY_ && cnt++ < maxLines) {
    idx = this.addParallel_(lat, squaredTolerance, extent, idx);
    lat += interval;
  }
  this.parallels_.length = idx;

};


/**
* @param {number} resolution Nominal resolution.
* @param {ol.Coordinate} graticuleCenter Centre of view.
* @param {ol.Extent} extent Extent of View.
* @param {number} squaredTolerance Squared tolerance (curve accuracy).
* @private
*/
ol.Graticule.prototype.draw3857Grid_ = function(resolution,
    graticuleCenter, extent, squaredTolerance) {

  var centerX = graticuleCenter[0];
  var centerY = graticuleCenter[1];
  var maxLines = this.maxLines_;
  var cnt, idx, lat, lon, lidx, ll;

  // Create parallels, at fixed haversine distance intervals
  // these will be unequally spaced at low zooms

  lat = goog.math.clamp(centerY, this.minY_, this.maxY_);
  idx = this.addParallel_(lat, squaredTolerance, extent, 0);

  cnt = 0;
  while (lat >= this.minY_ && cnt++ < maxLines) {

    ll = this.projGratToProj4326_([centerX, lat], undefined, 2);
    ll = ol.sphere.NORMAL.offset(ll, this.interval_, Math.PI);
    ll = this.proj4326ToProjGrat_(ll, undefined, 2);
    lat = ll[1];
    if (lat > this.minY_) {
      idx = this.addParallel_(lat, squaredTolerance, extent, idx);
    }
  }
  lat = goog.math.clamp(centerY, this.minY_, this.maxY_);
  cnt = 0;
  while (lat <= this.maxY_ && cnt++ < maxLines) {

    ll = this.projGratToProj4326_([centerX, lat], undefined, 2);
    ll = ol.sphere.NORMAL.offset(ll, this.interval_, 0);
    ll = this.proj4326ToProjGrat_(ll, undefined, 2);
    lat = ll[1];
    if (lat < this.maxY_) {
      idx = this.addParallel_(lat, squaredTolerance, extent, idx);
    }
  }
  this.parallels_.length = idx;

  // Create meridians, as locii of points at fixed distance intervals
  // from central meridian (using resolution determined from latitude).

  lon = goog.math.clamp(centerX, this.minX_, this.maxX_);
  idx = this.addMeridian_(lon, squaredTolerance, extent, 0);
  lidx = idx;

  cnt = 0;
  while (cnt++ < maxLines) {

    idx = this.addMeridian3857_(centerX, resolution, -cnt * this.interval_,
        squaredTolerance, extent, idx);

    // quit if no new meridian added (meridian does not intersect extent)
    if (idx == lidx) {
      break;
    } else {
      lidx = idx;
    }
  }

  lon = goog.math.clamp(centerX, this.minX_, this.maxX_);
  cnt = 0;
  while (cnt++ < maxLines) {

    idx = this.addMeridian3857_(centerX, resolution, cnt * this.interval_,
        squaredTolerance, extent, idx);

    // quit if no new meridian added (meridian does not intersect extent)
    if (idx == lidx) {
      break;
    } else {
      lidx = idx;
    }
  }

  this.meridians_.length = idx;

};


/**
* Get the resolution of the point in degrees. The point resolution is
* estimated by transforming the center pixel to EPSG:4326,
* measuring its width and height on the normal sphere,
* and taking the average of the width and height.
* @param {number} resolution Resolution in view projection units.
* @param {ol.Coordinate} point Point as view projection coordinates.
* @return {number} Point resolution in degrees.
* @private
*/
ol.Graticule.prototype.getDegreesResolution_ =
    function(resolution, point) {

  var vertices = [
    point[0] - resolution / 2, point[1],
    point[0] + resolution / 2, point[1],
    point[0], point[1] - resolution / 2,
    point[0], point[1] + resolution / 2
  ];
  vertices = this.projViewToProj4326_(vertices, vertices, 2);
  var width = Math.abs(vertices[0] - vertices[2]);
  var height = Math.abs(vertices[5] - vertices[7]);
  return (width + height) / 2;
};


/**
* @return {ol.Map} The map.
* @api
*/
ol.Graticule.prototype.getMap = function() {

  return this.map_;
};


/**
* @return {number} The interval or spacing of the grid in projection units.
* @api
*/
ol.Graticule.prototype.getInterval = function() {

  return this.interval_;
};


/**
* @param {number} lon Longitude.
* @param {number} squaredTolerance Squared tolerance.
* @param {number} index Index.
* @return {ol.geom.LineString} The meridian line string.
* @private
*/
ol.Graticule.prototype.getMeridian_ = function(lon, squaredTolerance, index) {

  var lineString;

  if (this.projectionsEquivalent_) {
    lineString = new ol.geom.LineString([[lon, this.minY_],
          [lon, this.maxY_]]);
  }
  else {
    var flatCoordinates = ol.geom.flat.geodesic.customMeridian(lon,
        this.minY_, this.maxY_, this.projGrat_, this.projView_,
        squaredTolerance);
    goog.asserts.assert(flatCoordinates.length > 0,
        'flatCoordinates cannot be empty');
    lineString = goog.isDef(this.meridians_[index]) ?
        this.meridians_[index] : new ol.geom.LineString(null);
    lineString.setFlatCoordinates(ol.geom.GeometryLayout.XY, flatCoordinates);
  }
  return lineString;
};


/**
* @param {number} centerX Central meridian X coord (metres).
* @param {number} resolution Nominal resolution in metres per pixel.
* @param {number} offset from Central meridian (metres).
* @param {number} squaredTolerance Squared tolerance.
* @param {number} index Index.
* @return {ol.geom.LineString} The meridian line string.
* @private
*/
ol.Graticule.prototype.getMeridian3857_ = function(centerX, resolution, offset,
    squaredTolerance, index) {

  // 'close' object values for the interpolate func below
  var projn = this.projGrat_;
  var maxY = this.maxY_;
  var minY = this.minY_;

  // interpolate func retuns point at offset from central meridian at
  // y between min and max y
  var interpolateFunc = function(fraction) {

    var y = (fraction * (maxY - minY)) + minY;
    var resn = projn.getPointResolution(resolution, [centerX, y]);
    var x = centerX + (offset * resolution / resn);
    return [x, y];
  };

  var flatCoordinates = ol.geom.flat.geodesic.transform(interpolateFunc,
      this.projGratToProjView_,
      squaredTolerance);

  this.clip3857Meridian_(flatCoordinates);

  var lineString = goog.isDef(this.meridians_[index]) ?
      this.meridians_[index] : new ol.geom.LineString(null);
  lineString.setFlatCoordinates(ol.geom.GeometryLayout.XY, flatCoordinates);

  return lineString;
};


/**
* @return {Array.<ol.geom.LineString>} The meridians.
* @api - for tests
*/
ol.Graticule.prototype.getMeridians = function() {
  return this.meridians_;
};


/**
* @param {number} lat Latitude.
* @param {number} squaredTolerance Squared tolerance.
* @return {ol.geom.LineString} The parallel line string.
* @param {number} index Index.
* @private
*/
ol.Graticule.prototype.getParallel_ = function(lat, squaredTolerance, index) {

  var lineString;

  if (this.projectionsEquivalent_) {
    lineString = new ol.geom.LineString([[this.minX_, lat],
          [this.maxX_, lat]]);
  }
  else {
    var flatCoordinates = ol.geom.flat.geodesic.customParallel(lat,
        this.minX_, this.maxX_, this.projGrat_, this.projView_,
        squaredTolerance);
    goog.asserts.assert(flatCoordinates.length > 0,
        'flatCoordinates cannot be empty');
    lineString = goog.isDef(this.parallels_[index]) ?
        this.parallels_[index] : new ol.geom.LineString(null);
    lineString.setFlatCoordinates(ol.geom.GeometryLayout.XY, flatCoordinates);
  }
  return lineString;
};


/**
* @return {Array.<ol.geom.LineString>} The parallels.
* @api - for tests
*/
ol.Graticule.prototype.getParallels = function() {
  return this.parallels_;
};


/**
* @param {ol.render.Event} e Event.
* @private
*/
ol.Graticule.prototype.handlePostCompose_ = function(e) {
  var vectorContext = e.vectorContext;
  var frameState = e.frameState;
  var extent = frameState.extent;
  var viewState = frameState.viewState;
  var center = viewState.center;
  var projection = viewState.projection;
  var resolution = viewState.resolution;
  var pixelRatio = frameState.pixelRatio;

  // accuracy for curved meridian / parallel fitting
  var squaredTolerance =
      resolution * resolution / (4 * pixelRatio * pixelRatio);

  // update View projection details
  if ((goog.isNull(this.projView_)) ||
      (!ol.proj.equivalent(projection, this.projView_))) {

    this.updateProjectionInfo_(projection);
  }

  this.createGraticule_(extent, center, resolution, squaredTolerance);

  // Draw the lines
  vectorContext.setFillStrokeStyle(null, this.strokeStyle_);
  var i, l, line;
  for (i = 0, l = this.meridians_.length; i < l; ++i) {
    line = this.meridians_[i];
    vectorContext.drawLineStringGeometry(line, null);
  }
  for (i = 0, l = this.parallels_.length; i < l; ++i) {
    line = this.parallels_[i];
    vectorContext.drawLineStringGeometry(line, null);
  }
};


/**
* @param {Array.<number>} flatCoordinates stride 2, length at least 4
* @param {number} x coord to truncate start line segment to
* @private
*/
ol.Graticule.prototype.lineStartAtX_ = function(flatCoordinates, x) {

  var x1 = flatCoordinates[2];
  var y1 = flatCoordinates[3];
  var x2 = flatCoordinates[0];
  var y2 = flatCoordinates[1];
  flatCoordinates[1] = ((x - x1) / (x2 - x1) * (y2 - y1)) + y1;
  flatCoordinates[0] = x;
};


/**
* @param {Array.<number>} flatCoordinates stride 2, length at least 4
* @param {number} x coord to truncate end line segment to
* @private
*/
ol.Graticule.prototype.lineEndAtX_ = function(flatCoordinates, x) {

  var ll = flatCoordinates.length;
  var x1 = flatCoordinates[ll - 4];
  var y1 = flatCoordinates[ll - 3];
  var x2 = flatCoordinates[ll - 2];
  var y2 = flatCoordinates[ll - 1];
  flatCoordinates[ll - 1] = ((x - x1) / (x2 - x1) * (y2 - y1)) + y1;
  flatCoordinates[ll - 2] = x;
};


/**
* @param {ol.Map} map Map.
* @api
*/
ol.Graticule.prototype.setMap = function(map) {
  if (!goog.isNull(this.map_)) {
    this.map_.un(ol.render.EventType.POSTCOMPOSE,
        this.handlePostCompose_, this);
    this.map_.render();
  }
  if (!goog.isNull(map)) {
    map.on(ol.render.EventType.POSTCOMPOSE,
        this.handlePostCompose_, this);
    map.render();
  }
  this.map_ = map;
  this.changed();
};


/**
* Set the view projection info.
* @param {ol.proj.Projection} projection View projection
* @private
*/
ol.Graticule.prototype.updateProjectionInfo_ =
    function(projection) {

  this.projView_ = projection;

  this.proj4326ToProjView_ = ol.proj.getTransformFromProjections(
      this.proj4326_, projection);
  this.projViewToProj4326_ = ol.proj.getTransformFromProjections(
      projection, this.proj4326_);
  this.projGratToProjView_ = ol.proj.getTransformFromProjections(
      this.projGrat_, projection);
  this.projViewToProjGrat_ = ol.proj.getTransformFromProjections(
      projection, this.projGrat_);

  this.projViewExtent_ = projection.getExtent();

  this.projViewWorldExtent_ = projection.getWorldExtent();
  if (goog.isNull(this.projViewWorldExtent_)) {
    this.projViewWorldExtent_ = ol.extent.applyTransform(
        this.projViewExtent_,
        this.projViewToProj4326_);
  }

  this.projectionsEquivalent_ =
      ol.proj.equivalent(this.projGrat_, projection);

};
