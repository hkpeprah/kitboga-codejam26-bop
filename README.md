# Bop

## Overview

This interface is a play on the "Bop It" reflex game. In order to skip the
interface, the user must "bop it", "twist it", etc., completing a set of
reflex challenges within `~ 1s` of each other.

## Configuration

### Query Parameters

|  Parameter  |   Type   | Default | Description                                                      |
| :---------: | :------: | :-----: | :--------------------------------------------------------------- |
| `challenge` | `string` |   `-`   | Force a specific challenge to be performed (or a specific mode).   |
| `attempts`  |   `int`  |   `3`   | Number of attempts the user has to complete the interface.         |
|  `timeout`  |   `int`  |  `30`   | Number of seconds user has to complete all steps of the interface. |

## Challenges

To force a specific challenge, the user can use the `?challenge=<string>` query
parameter. Otherwise, the normal interface will run. Challenges can have variants,
which alter the behaviour of the given challenge.

|   Challenge   | Description                                               |         Variants          | Implemented |
| :-----------: | :-------------------------------------------------------- | :-----------------------: | :---------: |
|   `press-it`  | User has to press the button.                             | `rotate`, `dvd`, `vanish` |    `Yes`    |
|   `pull-it`   | User has to hold and drag outwards an edge of the button. |           `rotate`        |    `Yes`    |
|  `squeeze-it` | User has to hold and drag inwards an edge of the button.  |           `rotate`        |    `Yes`    |
|   `hold-it`   | User has to hold the button until it fills up.            | `rotate`, `dvd`, `vanish` |    `Yes`    |
|   `shake-it`  | User has to shake the button until it fully drains.       | `rotate`, `dvd`, `vanish` |    `Yes`    |
| `assemble-it` | User has to assemble all the pieces of teh button.        |                           |    `Yes`    |

### Variants

|   Name   | Description                                      |
| :------: | :----------------------------------------------- |
| `rotate` | Button is rotated at a fixed angle.              |
|  `dvd`   | Button moves around the screen bounces on edges. |
| `vanish` | Button will randomly disappear and re-appear.    |

## Special Challenges

There are two special challenges: `test` and `demo`:

* Using the `test` challenge, one can play the interface without needing an ad to be presented.
* Using the `demo` challenge, one can iterate through and try out different interfaces.

Neither special challenges will emit a successful interface complete message.

### Demo

In the `demo` challenge, the user can navigate between interfaces by pressing the
`space` button. To iterate through variants for a given interface, press the
`v` button.

### Sounds

Sounds were generated using Fish Audio.
