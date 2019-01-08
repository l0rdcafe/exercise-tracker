const express = require("express");
const bodyParser = require("body-parser");
const { check, validationResult } = require("express-validator/check");
const knex = require("../db");

const router = express.Router();
const jsonParser = bodyParser.json({ type: "application/json" });

const isValidDate = date => {
  const d = new Date(date);
  return !isNaN(d.getTime());
}

router.post(
  "/users",
  jsonParser,
  [
    check("username")
      .isLength({ min: 1 })
      .trim()
      .escape()
  ],
  async (req, res) => {
    if (!req.body.username) {
      return res.status(400).json({ error: "No username found" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: "Invalid input" });
    }

    try {
      const result = await knex.raw("INSERT INTO users (username) values (?) RETURNING username", req.body.username);
      const { username } = result.rows[0];
      res.status(200).json({ msg: `Username ${username} created.` });
    } catch (e) {
      res.status(400).json({ error: `Could not create username ${req.body.username}` });
    }
  }
);

router.post(
  "/users/:userId/exercises",
  jsonParser,
  [
    check("description")
      .isLength({ min: 1 })
      .trim()
      .escape(),
    check("duration")
      .isLength({ min: 1 })
      .trim()
      .escape(),
    check("date")
      .trim()
      .escape()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: "Invalid input data" });
    }

    if (!isValidDate(req.body.date) && req.body.date) {
      return res.status(422).json({ error: "Invalid date" });
    }

    const isValidId = /^\d+$/.test(req.params.userId);
    if (!isValidId) {
      return res.status(422).json({ error: "Invalid user ID" });
    }

    try {
      const result = await knex("exercises")
        .insert({
          description: req.body.description,
          user_id: req.params.userId,
          duration: req.body.duration,
          date: req.body.date || null
        })
        .returning("user_id");
      const userId = result[0];
      res.status(200).json({ error: `Exercise created for user with id ${userId}` });
    } catch (e) {
      console.log(e);
      res.status(400).json({ error: "Could not create exercise." });
    }
  }
);

router.get("/users/:userId/exercises?", async (req, res) => {
  const isValidId = /^\d+$/.test(req.params.userId);
  if (!isValidId) {
    return res.status(422).json({ error: "Invalid user ID" });
  }

  if (req.query.from && !isValidDate(req.query.from)) {
    return res.status(422).json({ error: "Invalid start date" });
  }

  if (req.query.to && !isValidDate(req.query.to)) {
    return res.status(422).json({ error: "Invalid end date" });
  }

  try {
    const query = knex("exercises")
      .select("users.username", "exercises.description", "exercises.duration", "exercises.date")
      .join("users", "users.id", "=", "exercises.user_id")
      .where("exercises.user_id", "=", req.params.userId);

    if (req.query.from) {
      query.andWhere("date", ">=", req.query.from);
    }

    if (req.query.to) {
      query.andWhere("date", "=<", req.query.to);
    }

    if (req.query.limit) {
      query.limit(req.query.limit);
    }
    const result = await query;
    const exercises = [...result];
    res.status(200).json({ exercises });
  } catch (e) {
    console.log(e);
    res.status(404).json({ error: `Exercises for user with ID ${req.params.userId} not found.` });
  }
});

module.exports = router;
