class TrafficController {
  constructor() {
    this.maxConcurrent = 2;
    this.active = new Set();
  }

  canStart(id) {
    return this.active.size < this.maxConcurrent;
  }

  start(id) {
    this.active.add(id);
  }

  end(id) {
    this.active.delete(id);
  }

  activeCount() {
    return this.active.size;
  }
}

module.exports = new TrafficController();
