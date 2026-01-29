# fritzgerald

A rather simple network map using [d3js](https://d3js.org/), fueled by [fritzi](https://github.com/hikkoiri/fritzi).

![Web Demo](./assets/demo.gif)

### systemd service

You can simply run this as Linux service. Adapt the template file `fritzgerald.service` and store it in the right location:

```bash
sudo nano /etc/systemd/system/fritzgerald.service
#enter systemd file content
sudo systemctl --system daemon-reload
sudo systemctl enable fritzgerald
sudo systemctl start fritzgerald
sudo systemctl status fritzgerald
```