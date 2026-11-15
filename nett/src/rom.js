// Rom — one Durable Object per room code, always created in the EU (index.js, romFor).
//
// What a room stores (and nothing else): the game id, the host's setup and seed, the seats (a
// random token each, so a phone can take its seat back, and an optional nickname) and the ordered
// list of moves. It relays the moves in order and gives a phone that comes back the setup and the
// whole list, so the phone can replay the match: the games are deterministic with the same seed
// and the same moves. The room never looks inside a move; the phones' game rules do.
//
// The sockets use the WebSocket Hibernation API (ctx.acceptWebSocket + webSocketMessage /
// webSocketClose): a room nobody is playing in costs nothing, and its memory is read back from
// storage when the next message wakes it.
//
// Deletion: an alarm deletes everything 24 hours after the last activity; a finished match is
// deleted at once when no phone is left in it; a code nobody opened goes after 10 minutes.
import { SPILL, FART, FART_STENG, MAKS_KOBLINGER, MAKS_TREKK, LEVETID_MS, RESERVERT_MS } from "./oppsett.js";
import { lesMelding, rensNavn, erFro, kjentSpill, gyldigOppsett, gyldigTrekk, gyldigReaksjon, nyttToken, erToken } from "./protokoll.js";

// Storage: the key "rom" (the room) and one key per move, "t:0000" … "t:1999".
const ROM = "rom";
const TREKK = "t:";
const trekkNokkel = (n) => TREKK + String(n).padStart(4, "0");

// Close codes the phones understand (rusj/kit/nett.js does not reconnect after these).
export const LUKK = { forlatt: 1000, fort: 4008, erstattet: 4000, slettet: 4001, full: 4003, ukjent: 4004 };

export class Rom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.rom = undefined; // undefined: not read since the room woke up; null: no room here
    this.logg = [];
    this.fart = new Map(); // socket → the times of its latest messages (memory only)
    // The phones' keep-alive is answered without waking the room.
    try {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    } catch (e) {
      /* not available: the room answers nothing, and the phone only keeps its line open */
    }
  }

  naa() {
    return Date.now();
  }

  async hent() {
    if (this.rom !== undefined) return this.rom;
    const rom = (await this.ctx.storage.get(ROM)) || null;
    let logg = [];
    if (rom && rom.n) logg = [...(await this.ctx.storage.list({ prefix: TREKK })).values()];
    this.rom = rom;
    this.logg = logg;
    return rom;
  }

  async lagre(ekstra) {
    const naa = this.naa();
    this.rom.sist = naa;
    await this.ctx.storage.put({ [ROM]: this.rom, ...(ekstra || {}) });
    await this.ctx.storage.setAlarm(naa + LEVETID_MS);
  }

  // ---------- Sockets ----------

  tokenFor(ws) {
    try {
      const a = ws.deserializeAttachment();
      return (a && a.token) || null;
    } catch (e) {
      return null;
    }
  }
  seteFor(ws) {
    const t = this.tokenFor(ws);
    return t && this.rom && this.rom.seter ? this.rom.seter.findIndex((s) => s.token === t) : -1;
  }
  apne(utenom) {
    return this.ctx.getWebSockets().filter((w) => w !== utenom && !(w.readyState > 1));
  }
  send(ws, melding) {
    try {
      ws.send(JSON.stringify(melding));
    } catch (e) {
      /* the socket is going: its close event cleans up */
    }
  }
  kringkast(melding, utenom) {
    const tekst = JSON.stringify(melding);
    for (const ws of this.apne(utenom)) {
      try {
        ws.send(tekst);
      } catch (e) {
        /* as above */
      }
    }
  }
  steng(ws, kode, grunn) {
    this.fart.delete(ws);
    try {
      ws.close(kode, grunn);
    } catch (e) {
      /* already closed */
    }
  }
  avvis(ws, kode) {
    this.send(ws, { h: "feil", kode });
    this.steng(ws, kode === "ukjent" ? LUKK.ukjent : LUKK.full, kode);
  }

  // The seats as every phone sees them: nickname, connected now, left the match. Never a token.
  seterUt(utenom) {
    const tokens = new Set(this.apne(utenom).map((w) => this.tokenFor(w)).filter(Boolean));
    return this.rom.seter.map((s) => ({ navn: s.navn, med: !!s.token && tokens.has(s.token), borte: !!s.borte }));
  }
  // Everything a phone needs to draw the room and replay the match. Its own token only to itself.
  tilstand(ws) {
    const r = this.rom;
    const [min, maks] = SPILL[r.spill];
    const du = this.seteFor(ws);
    return {
      h: "rom",
      spill: r.spill,
      oppsett: r.oppsett,
      fro: r.fro,
      kamp: r.kamp,
      min,
      maks,
      startet: r.startet,
      ferdig: r.ferdig,
      seter: this.seterUt(),
      du,
      ...(du >= 0 ? { token: r.seter[du].token } : {}),
      logg: this.logg,
    };
  }
  tilAlle() {
    for (const ws of this.apne()) this.send(ws, this.tilstand(ws));
  }

  // At most FART.antall messages per FART.ms per socket; a socket far above that is closed.
  slipp(ws) {
    const naa = this.naa();
    const liste = (this.fart.get(ws) || []).filter((t) => naa - t < FART.ms);
    liste.push(naa);
    this.fart.set(ws, liste);
    if (liste.length > FART_STENG) {
      this.send(ws, { h: "feil", kode: "fort" });
      this.steng(ws, LUKK.fort, "fort");
      return false;
    }
    if (liste.length > FART.antall) {
      this.send(ws, { h: "feil", kode: "fort" });
      return false;
    }
    return true;
  }

  // ---------- Requests from the Worker ----------

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/reserver") return this.reserver();
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return new Response("Bare WebSocket.", { status: 426 });
    const par = new WebSocketPair();
    const [klient, tjener] = [par[0], par[1]];
    this.ctx.acceptWebSocket(tjener);
    tjener.serializeAttachment({ token: null });
    const rom = await this.hent();
    // A phone that cannot come in is told why (a refused upgrade would only look like a lost
    // connection to it), then the socket is closed.
    if (!rom) this.avvis(tjener, "ukjent");
    else if (this.apne().length > MAKS_KOBLINGER) this.avvis(tjener, "full");
    return new Response(null, { status: 101, webSocket: klient });
  }

  // POST /rom asks for a code: yes only when nothing is stored here.
  async reserver() {
    const rom = await this.hent();
    if (rom) return new Response(null, { status: 409 });
    const naa = this.naa();
    this.rom = { v: 1, spill: null, laget: naa, sist: naa };
    this.logg = [];
    await this.ctx.storage.put(ROM, this.rom);
    await this.ctx.storage.setAlarm(naa + RESERVERT_MS);
    return new Response(null, { status: 201 });
  }

  // ---------- Messages from the phones ----------

  async webSocketMessage(ws, melding) {
    if (!this.slipp(ws)) return;
    const { m, feil } = lesMelding(melding);
    if (feil) return this.send(ws, { h: "feil", kode: feil });
    const rom = await this.hent();
    if (!rom) return this.avvis(ws, "ukjent");
    if (m.h === "lag") return this.lag(ws, m);
    if (!rom.spill) return this.avvis(ws, "ukjent");
    if (m.h === "bli") return this.bli(ws, m);
    const sete = this.seteFor(ws);
    if (sete < 0) return this.send(ws, { h: "feil", kode: "sete" });
    if (m.h === "start") return this.start(ws, sete);
    if (m.h === "trekk") return this.trekk(ws, m, sete);
    if (m.h === "reaksjon") return this.reaksjon(ws, m, sete);
    if (m.h === "ferdig") return this.ferdig(ws);
    if (m.h === "ny") return this.ny(ws, m);
    if (m.h === "forlat") return this.forlat(ws, sete);
  }

  // The host sets up the room it reserved: game, setup, seed, and seat 0.
  async lag(ws, m) {
    const r = this.rom;
    if (r.spill) return this.send(ws, { h: "feil", kode: "opptatt" });
    if (!kjentSpill(m.spill) || !gyldigOppsett(m.oppsett) || !erFro(m.fro)) return this.send(ws, { h: "feil", kode: "ugyldig" });
    const token = nyttToken();
    this.rom = { v: 1, spill: m.spill, oppsett: m.oppsett, fro: m.fro, kamp: 1, seter: [{ token, navn: rensNavn(m.navn) }], startet: false, ferdig: false, n: 0, laget: r.laget, sist: r.sist };
    this.logg = [];
    ws.serializeAttachment({ token });
    await this.lagre();
    this.send(ws, this.tilstand(ws));
  }

  // A phone comes in: back to its own seat with its token, or to a new seat while there is room
  // and the match has not started. A full or started room says no.
  async bli(ws, m) {
    const r = this.rom;
    const [, maks] = SPILL[r.spill];
    const egen = erToken(m.token) ? r.seter.findIndex((s) => s.token === m.token) : -1;
    if (egen >= 0) {
      // Another socket that still holds the seat (an old tab, a connection that died quietly) goes.
      for (const w of this.apne(ws)) if (this.tokenFor(w) === m.token) this.steng(w, LUKK.erstattet, "erstattet");
      ws.serializeAttachment({ token: m.token });
      await this.lagre();
      this.send(ws, this.tilstand(ws));
      this.kringkast({ h: "seter", seter: this.seterUt() }, ws);
      return;
    }
    if (r.seter.length >= maks) return this.avvis(ws, "full");
    if (r.startet) return this.avvis(ws, "startet");
    const token = nyttToken();
    r.seter.push({ token, navn: rensNavn(m.navn) });
    ws.serializeAttachment({ token });
    // The room starts by itself when the last seat is taken.
    if (r.seter.length >= maks) r.startet = true;
    await this.lagre();
    this.send(ws, this.tilstand(ws));
    this.kringkast({ h: "seter", seter: this.seterUt() }, ws);
    if (r.startet) this.kringkast({ h: "start" });
  }

  // The host starts before every seat is taken (Yatzy and Ludo), when enough are in.
  async start(ws, sete) {
    const r = this.rom;
    if (sete !== 0 || r.startet || r.seter.length < SPILL[r.spill][0]) return this.send(ws, { h: "feil", kode: "ugyldig" });
    r.startet = true;
    await this.lagre();
    this.kringkast({ h: "start" });
  }

  // A move. `n` is the place the phone expects it to get in the list: a move sent on an old view
  // of the match (two phones at the same time, or a resend after a lost connection) is refused,
  // and the phone gets the moves it missed in order anyway.
  async trekk(ws, m, sete) {
    const r = this.rom;
    if (!r.startet || r.ferdig) return this.send(ws, { h: "feil", kode: "ugyldig" });
    if (!Number.isInteger(m.n) || m.n !== r.n) return this.send(ws, { h: "feil", kode: "utdatert", n: r.n });
    if (r.n >= MAKS_TREKK) return this.send(ws, { h: "feil", kode: "logg" });
    if (!gyldigTrekk(m.t)) return this.send(ws, { h: "feil", kode: "ugyldig" });
    const n = r.n;
    this.logg.push([sete, m.t]);
    r.n = n + 1;
    await this.lagre({ [trekkNokkel(n)]: [sete, m.t] });
    this.kringkast({ h: "trekk", n, s: sete, t: m.t });
  }

  // One of six preset emoji, to the others. Not stored.
  reaksjon(ws, m, sete) {
    if (!gyldigReaksjon(m.e)) return this.send(ws, { h: "feil", kode: "ugyldig" });
    this.kringkast({ h: "reaksjon", s: sete, e: m.e }, ws);
  }

  // A phone says the match is over (its rules decided it). The room then goes as soon as nobody
  // is left in it.
  async ferdig(ws) {
    const r = this.rom;
    if (!r.startet) return this.send(ws, { h: "feil", kode: "ugyldig" });
    if (!r.ferdig) {
      r.ferdig = true;
      await this.lagre();
    }
    await this.sjekkTom();
  }

  // «Ny kamp»: the same seats (minus those who left), a new seed, an empty list.
  async ny(ws, m) {
    const r = this.rom;
    if (!r.ferdig || !erFro(m.fro)) return this.send(ws, { h: "feil", kode: "ugyldig" });
    const gamle = Array.from({ length: r.n }, (_, i) => trekkNokkel(i));
    r.seter = r.seter.filter((s) => !s.borte && s.token);
    r.kamp = (r.kamp || 1) + 1;
    r.fro = m.fro;
    r.n = 0;
    r.ferdig = false;
    r.startet = r.seter.length >= SPILL[r.spill][0];
    this.logg = [];
    for (let i = 0; i < gamle.length; i += 128) await this.ctx.storage.delete(gamle.slice(i, i + 128));
    await this.lagre();
    this.tilAlle();
  }

  // A phone leaves on purpose. Before the start its seat is freed (and when the host goes, the
  // room goes); after the start the seat stays as «left» and the match is over.
  async forlat(ws, sete) {
    const r = this.rom;
    if (!r.startet) {
      if (sete === 0) return this.slettAlt("verten");
      r.seter.splice(sete, 1);
      ws.serializeAttachment({ token: null });
      this.steng(ws, LUKK.forlatt, "forlatt");
      await this.lagre();
      this.tilAlle();
      return;
    }
    r.seter[sete].borte = true;
    r.seter[sete].token = null;
    r.ferdig = true;
    ws.serializeAttachment({ token: null });
    this.steng(ws, LUKK.forlatt, "forlatt");
    await this.lagre();
    this.kringkast({ h: "seter", seter: this.seterUt() });
    await this.sjekkTom();
  }

  async webSocketClose(ws) {
    this.fart.delete(ws);
    try {
      ws.close(1000, "");
    } catch (e) {
      /* already closed */
    }
    const rom = await this.hent();
    if (!rom || !rom.spill) return;
    this.kringkast({ h: "seter", seter: this.seterUt(ws) }, ws);
    await this.sjekkTom(ws);
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  // A finished match with no phone left in a seat: delete it now.
  async sjekkTom(utenom) {
    const r = this.rom;
    if (!r || !r.ferdig) return;
    const tokens = new Set(r.seter.map((s) => s.token).filter(Boolean));
    if (!this.apne(utenom).some((w) => tokens.has(this.tokenFor(w)))) await this.slettAlt("ferdig");
  }

  // ---------- Deletion ----------

  async alarm() {
    const rom = await this.hent();
    if (!rom) return this.slettAlt("tid");
    const frist = rom.spill ? rom.sist + LEVETID_MS : rom.laget + RESERVERT_MS;
    if (this.naa() >= frist - 1000) return this.slettAlt("tid");
    await this.ctx.storage.setAlarm(frist);
  }

  async slettAlt(grunn) {
    for (const ws of this.apne()) {
      this.send(ws, { h: "slettet", grunn });
      this.steng(ws, LUKK.slettet, "slettet");
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.rom = null;
    this.logg = [];
    this.fart.clear();
  }
}
