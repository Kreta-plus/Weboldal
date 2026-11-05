"""Kapcsolatok oldal: a Discord-meghívó élő adatai (név, ikon, létszám)."""
from flask import Blueprint, jsonify

from .. import discord

bp = Blueprint("contact", __name__, url_prefix="/api/contact")


@bp.get("/discord")
def discord_invite():
    return jsonify(discord.invite_info())
