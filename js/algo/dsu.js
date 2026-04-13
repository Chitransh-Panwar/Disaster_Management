export class DSU {
  constructor(items) {
    this.parent = new Map();
    this.rank = new Map();
    this._components = 0;

    for (const x of items) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      this._components++;
    }
  }

  find(x) {
    const p = this.parent.get(x);
    if (p === undefined) throw new Error('DSU find: unknown item');
    if (p === x) return x;
    const r = this.find(p);
    this.parent.set(x, r);
    return r;
  }

  union(a, b) {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;

    const rankA = this.rank.get(ra) ?? 0;
    const rankB = this.rank.get(rb) ?? 0;

    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }

    this._components--;
    return true;
  }

  components() {
    return this._components;
  }
}
