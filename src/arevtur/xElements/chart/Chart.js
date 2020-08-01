const {XElement, importUtil} = require('xx-element');
const {template, name} = importUtil(__filename);
const {configForRenderer} = require('../../../services/configForRenderer')

customElements.define(name, class Chart extends XElement {
	static get attributeTypes() {
		return {width: {}, height: {}, axisLabelX: {}, axisLabelY: {}};
	}

	static get htmlTemplate() {
		return template;
	}

	connectedCallback() {
		configForRenderer.listenConfigChange(config =>
			this.draw());

		this.ctx = this.$('canvas').getContext('2d');

		this.$('canvas').addEventListener('mousedown', e => {
			this.dragged = false;
			if (!e.ctrlKey)
				this.mouseDown = {x: e.offsetX, y: e.offsetY};
			e.preventDefault();
		});
		this.$('canvas').addEventListener('mousemove', e => {
			this.emit('hover', this.pixelToCoord(e.offsetX, e.offsetY));
			if (!this.mouseDown)
				return;
			this.dragged = true;
			this.$('#always-refocus-check').checked = false;
			if (e.buttons & 1 && !e.shiftKey)
				this.panRange(e.offsetX - this.mouseDown.x, e.offsetY - this.mouseDown.y);
			else if (e.buttons & 2 || e.shiftKey)
				this.zoomRange(e.offsetX - this.mouseDown.x, e.offsetY - this.mouseDown.y);
			this.mouseDown = {x: e.offsetX, y: e.offsetY};
		});
		this.$('canvas').addEventListener('mouseleave', () => this.emit('hover'));
		document.addEventListener('mouseup', () => this.mouseDown = null);
		this.$('canvas').addEventListener('click', e => {
			if (this.dragged)
				return;
			this.emit(e.ctrlKey ? 'action' : 'select', this.pixelToCoord(e.offsetX, e.offsetY));
		});
		this.$('canvas').addEventListener('dblclick', e => {
			if (this.dragged)
				return;
			this.resetRange(e.shiftKey);
		});
		this.$('canvas').addEventListener('wheel', e => {
			this.$('#always-refocus-check').checked = false;
			let d = e.deltaY / 10;
			this.zoomRange(-d, d);
		});

		this.$('#always-refocus-check').checked = localStorage.getItem('chart-always-refocus');
		this.$('#refocus-button').addEventListener('click', () => this.resetRange());
		this.$('#always-refocus-check').addEventListener('input', () => {
			this.saveAutoRefocus();
			this.resetRange();
		});

		this.resetRange();
		this.pointSets = [];
	}

	set width(value) {
		this.$('canvas').width = value;
	}

	set height(value) {
		this.$('canvas').height = value;
	}

	set axisLabelX(value) {
		this.draw();
	}

	set axisLabelY(value) {
		this.draw();
	}

	set pointSets(value) {
		this.pointSets_ = value;
		if (this.$('#always-refocus-check').checked)
			this.resetRange();
		else
			this.draw();
	}

	resetRange(zeroMins = false) {
		let allPoints = this.pointSets_
			.filter(({isPath}) => !isPath)
			.flatMap(({points}) => points);
		[this.minX, this.deltaX] = Chart.getRange(allPoints.map(({x}) => x), zeroMins);
		[this.minY, this.deltaY] = Chart.getRange(allPoints.map(({y}) => y), zeroMins);
		this.verifyRange();
		this.draw();
	}

	panRange(x, y) {
		this.minX -= x * this.deltaX / this.width;
		this.minY += y * this.deltaY / this.height;
		this.verifyRange();
		this.draw();
	}

	zoomRange(x, y) {
		let dx = x * this.deltaX / this.width;
		let dy = -y * this.deltaY / this.height;
		this.minX += dx;
		this.minY += dy;
		this.deltaX -= dx * 2;
		this.deltaY -= dy * 2;
		this.verifyRange();
		this.draw();
	}

	verifyRange() {
		this.minX = Math.max(this.minX, -this.deltaX / 10);
		this.minY = Math.max(this.minY, -this.deltaY / 10);
	}

	draw() {
		if (!this.ctx || !this.pointSets_ || this.minX === undefined)
			return;
		this.ctx.clearRect(0, 0, this.width, this.height);
		this.drawPoints();
		this.drawAxis();
	}

	drawPoints() {
		this.pointSets_.forEach(({color, cssPropertyValueColor, fill, size, points, isPath}) => {
			color = color || getComputedStyle(this).getPropertyValue(cssPropertyValueColor);
			this.ctx.strokeStyle = color;
			this.ctx.fillStyle = color;
			if (isPath) {
				this.ctx.lineWidth = size;
				this.ctx.beginPath();
				points.forEach((p, i) => {
					let {x, y} = this.coordToPixel(p.x, p.y);
					if (!i)
						this.ctx.moveTo(x, y);
					else
						this.ctx.lineTo(x, y);
				});
				if (fill)
					this.ctx.fill();
				else
					this.ctx.stroke();
			} else {
				points.forEach(p => {
					let {x, y} = this.coordToPixel(p.x, p.y);
					this.ctx[fill ? 'fillRect' : 'strokeRect'](x - size / 2, y - size / 2, size, size);
				});
			}
		});
	}

	drawAxis() {
		let n = 20;
		let step = this.width / n, stepY = this.height / n;
		let tickLength = 10;

		this.ctx.lineWidth = 1;
		let color = getComputedStyle(this).getPropertyValue('--interactable-primary');
		this.ctx.strokeStyle = color;
		this.ctx.fillStyle = color;
		this.line(step * 1.5, stepY * 18.5, step * 18, 0); // x axis line
		this.line(step * 1.5, stepY * .5, 0, stepY * 18); // y axis line
		this.ctx.font = '16px arial';
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'bottom';
		this.ctx.fillText(this.axisLabelX, step * 10, stepY * 20); // x axis label
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'top';
		this.verticalText(this.axisLabelY, 0, stepY * 10); // y axis label
		this.ctx.font = '14px arial';
		for (let i = 2; i < n; i += 2) {
			let x = i * step;
			let y = (n - i) * stepY;
			let xText = Chart.numToPrint(this.minX + i / n * this.deltaX);
			let yText = Chart.numToPrint(this.minY + i / n * this.deltaY);
			this.ctx.textAlign = 'center';
			this.ctx.textBaseline = 'top';
			this.ctx.fillText(xText, x, stepY * 18.5 + tickLength); // x axis text
			this.ctx.textAlign = 'right';
			this.ctx.textBaseline = 'middle';
			this.ctx.fillText(yText, step * 1.5 - tickLength, y, 30); // y axis text
			this.line(x, stepY * 18.5 - tickLength / 2, 0, tickLength); // x axis tick
			this.line(step * 1.5 - tickLength / 2, y, tickLength, 0); // y axis tick
		}
	}

	verticalText(text, x, y) {
		this.ctx.save();
		this.ctx.translate(x, y);
		this.ctx.rotate(-Math.PI / 2);
		this.ctx.fillText(text, 0, 0);
		this.ctx.restore();
	}

	line(x, y, xd, yd) {
		this.ctx.beginPath();
		this.ctx.moveTo(x, y);
		this.ctx.lineTo(x + xd, y + yd);
		this.ctx.stroke();
	}

	pixelToCoord(x, y) {
		return {
			x: x / this.width * this.deltaX + this.minX,
			y: (1 - y / this.height) * this.deltaY + this.minY,
			width: 20 / this.width * this.deltaX,
			height: 20 / this.height * this.deltaY
		};
	}

	coordToPixel(x, y) {
		return {
			x: x === Infinity ? this.width : (x - this.minX) / this.deltaX * this.width,
			y: y === Infinity ? 0 : (1 - (y - this.minY) / this.deltaY) * this.height,
		};
	}

	saveAutoRefocus() {
		localStorage.setItem('chart-always-refocus', this.$('#always-refocus-check').checked);
	}

	static getRange(values, zeroMin = false, buffer = .1) {
		let min = values.length && !zeroMin ? Math.min(...values) : 0;
		let max = values.length ? Math.max(...values) : 10;
		let delta = max - min + .001;
		return [min - delta * buffer, delta + delta * buffer * 2]
	}

	static numToPrint(n) {
		return Math.round(n * 10) / 10;
	}
});
