// Small stand-ins for the parts of Cloudflare the Worker uses, for the tests: a Durable Object's
// state (the async storage API with its alarm, and the WebSocket Hibernation API), WebSocketPair,
// the auto-response pair, a namespace with jurisdictions, and a Response that accepts status 101.
// The room code under test (src/rom.js) is the real one; only the platform around it is faked.
import { Rom } from "../src/rom.js";

// ---------- Platform globals ----------

const EkteResponse = globalThis.Response;
class SvarMedSokkel extends EkteResponse {
  constructor(kropp, init) {
    if (init && init.status === 101) {
      super(null, { ...init, status: 200 });
      this._status = 101;
      this.webSocket = init.webSocket;
    } else super(kropp, init);
  }
  get status() {
    return this._status ?? super.status;
  }
}
globalThis.Response = SvarMedSokkel;

globalThis.WebSocketRequestResponsePair = class {
  constructor(sporsmal, svar) {
    this.sporsmal = sporsmal;
    this.svar = svar;
  }
};

// One end of a socket. The room holds the server end; a test holds the client end.
export class FalskSokkel {
  constructor() {
    this.readyState = 1;
    this.motpart = null;
    this.vedlegg = null;
    this.mottatt = []; // client end: every message the room sent, parsed
    this.lukket = null; // client end: { kode, grunn } when the room closed it
  }
  send(tekst) {
    if (this.readyState !== 1) throw new Error("WebSocket is closed");
    if (typeof tekst !== "string") throw new Error("only text in these tests");
    this.motpart.mottatt.push(JSON.parse(tekst));
  }
  close(kode, grunn) {
    if (this.readyState === 3) return;
    if (kode !== undefined && kode !== 1000 && (kode < 3000 || kode > 4999)) throw new Error(`close code ${kode} may not be sent`);
    this.readyState = 3;
    if (this.motpart.readyState !== 3) {
      this.motpart.readyState = 3;
      this.motpart.lukket = { kode, grunn };
    }
  }
  serializeAttachment(v) {
    const s = JSON.stringify(v);
    if (s.length > 2048) throw new Error("attachment too large");
    this.vedlegg = s;
  }
  deserializeAttachment() {
    return this.vedlegg == null ? null : JSON.parse(this.vedlegg);
  }
}

globalThis.WebSocketPair = class {
  constructor() {
    const a = new FalskSokkel();
    const b = new FalskSokkel();
    a.motpart = b;
    b.motpart = a;
    this[0] = a;
    this[1] = b;
  }
};

// ---------- A Durable Object's state ----------

export function falskLager() {
  const data = new Map();
  let alarm = null;
  const kopi = (v) => (v === undefined ? undefined : structuredClone(v));
  const lager = {
    data,
    skrivinger: 0,
    get alarmTid() {
      return alarm;
    },
    async get(k) {
      if (Array.isArray(k)) return new Map(k.filter((x) => data.has(x)).map((x) => [x, kopi(data.get(x))]));
      return kopi(data.get(k));
    },
    async put(k, v) {
      lager.skrivinger++;
      if (k && typeof k === "object") {
        const par = Object.entries(k);
        if (par.length > 128) throw new Error("put: at most 128 keys");
        for (const [a, b] of par) data.set(a, kopi(b));
      } else data.set(k, kopi(v));
    },
    async delete(k) {
      if (Array.isArray(k)) {
        if (k.length > 128) throw new Error("delete: at most 128 keys");
        let n = 0;
        for (const x of k) if (data.delete(x)) n++;
        return n;
      }
      return data.delete(k);
    },
    async deleteAll() {
      data.clear();
    },
    async list(o = {}) {
      const prefix = o.prefix || "";
      return new Map([...data.keys()].filter((k) => k.startsWith(prefix)).sort().map((k) => [k, kopi(data.get(k))]));
    },
    async setAlarm(t) {
      alarm = Number(t);
    },
    async getAlarm() {
      return alarm;
    },
    async deleteAlarm() {
      alarm = null;
    },
  };
  return lager;
}

export function falskCtx() {
  const sokler = new Set();
  return {
    storage: falskLager(),
    autoSvar: null,
    sokler,
    acceptWebSocket(ws) {
      sokler.add(ws);
    },
    getWebSockets() {
      return [...sokler].filter((w) => w.readyState !== 3);
    },
    setWebSocketAutoResponse(par) {
      this.autoSvar = par;
    },
  };
}

// ---------- A namespace (env.ROM) with jurisdictions ----------

export function falskNavnerom() {
  const rom = new Map(); // "eu:<name>" → { ctx, rom }
  const kall = []; // what was asked for: { jurisdiksjon, navn }
  const ns = {
    rom,
    kall,
    jurisdiction(j) {
      return {
        idFromName: (navn) => ({ jurisdiksjon: j, navn, toString: () => `${j}:${navn}` }),
        get(id) {
          kall.push({ jurisdiksjon: id.jurisdiksjon, navn: id.navn });
          const nokkel = `${id.jurisdiksjon}:${id.navn}`;
          if (!rom.has(nokkel)) {
            const ctx = falskCtx();
            rom.set(nokkel, { ctx, rom: new Rom(ctx, {}) });
          }
          const plass = rom.get(nokkel);
          return { fetch: (inn, init) => plass.rom.fetch(inn instanceof Request ? inn : new Request(inn, init)) };
        },
      };
    },
    idFromName() {
      throw new Error("rooms must be created through jurisdiction('eu')");
    },
    get() {
      throw new Error("rooms must be created through jurisdiction('eu')");
    },
  };
  return ns;
}

// ---------- Helpers for the room tests ----------

export const NAA = Date.UTC(2026, 10, 15, 12, 0, 0);

// A room with a fake clock (rom.klokke.naa is the time it sees).
export function nyttRom(naa = NAA) {
  const ctx = falskCtx();
  const rom = new Rom(ctx, {});
  const klokke = { naa };
  rom.naa = () => klokke.naa;
  return { ctx, rom, klokke };
}

// The same room after hibernation: a new object over the same storage and sockets.
export function vekk({ ctx, klokke }) {
  const rom = new Rom(ctx, {});
  rom.naa = () => klokke.naa;
  return rom;
}

export const oppgradering = (hode = {}) => new Request("https://rom/rom/ABCDEF", { headers: { Upgrade: "websocket", Origin: "https://rusj.no", ...hode } });

// A phone in the room: its client end, what it got, and send / close.
export async function koble(r, hode) {
  const rom = typeof r.webSocketMessage === "function" ? r : r.rom;
  const svar = await rom.fetch(oppgradering(hode));
  const klient = svar.webSocket;
  const tjener = klient.motpart;
  return {
    svar,
    klient,
    tjener,
    get mottatt() {
      return klient.mottatt;
    },
    get siste() {
      return klient.mottatt[klient.mottatt.length - 1];
    },
    av: (h) => klient.mottatt.filter((m) => m.h === h),
    tom() {
      klient.mottatt.length = 0;
    },
    send: (m, mal = rom) => mal.webSocketMessage(tjener, typeof m === "string" ? m : JSON.stringify(m)),
    async lukk(mal = rom) {
      klient.readyState = 3;
      tjener.readyState = 3;
      await mal.webSocketClose(tjener, 1001, "", true);
    },
    get apen() {
      return klient.readyState === 1;
    },
  };
}

// A reserved room with a host in it: { ...room, vert }.
export async function romMedVert(spill = "fireren", o = {}) {
  const r = nyttRom(o.naa);
  assert201(await r.rom.reserver());
  const vert = await koble(r);
  await vert.send({ h: "lag", spill, oppsett: o.oppsett || { mal: 3 }, fro: o.fro ?? 12345, navn: o.navn ?? "Testspiller A" });
  return { ...r, vert };
}

function assert201(svar) {
  if (svar.status !== 201) throw new Error("reserver: " + svar.status);
}
